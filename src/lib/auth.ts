import "server-only";

import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb, queryRows } from "@/lib/db";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-mfs_session" : "mfs_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derivePasswordKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export type SessionUser = {
  id: string;
  email: string;
  role: "client" | "model" | "admin";
  display_name: string;
  status: string;
  email_verified_at: string | null;
  age_verified_at: string | null;
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await derivePasswordKey(password, salt);
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string | null | undefined) {
  const performDummyHash = async () => {
    await derivePasswordKey(password, Buffer.alloc(16, 0x5a));
    return false;
  };
  if (!encoded) return performDummyHash();
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt" || parts[1] !== "16384" || parts[2] !== "8" || parts[3] !== "1") return performDummyHash();
  try {
    const salt = Buffer.from(parts[4], "base64url");
    const expected = Buffer.from(parts[5], "base64url");
    if (salt.length !== 16 || expected.length !== 64) return performDummyHash();
    const actual = await derivePasswordKey(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashPrivateValue(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function enforceRateLimit(request: Request, scope: string, maxHits: number, windowSeconds: number, includeAddress = true) {
  const address = includeAddress ? `\n${request.headers.get("x-real-ip")?.trim() || "unknown"}` : "";
  const bucket = hashPrivateValue(`${scope}${address}`);
  const sql = getDb();
  const rows = queryRows<{ allowed: boolean }>(await sql`SELECT consume_auth_rate_limit(${bucket}, ${maxHits}, ${windowSeconds}) AS allowed`);
  return rows[0]?.allowed === true;
}

export function assertSameOrigin(request: Request) {
  const appUrl = process.env.APP_URL;
  const origin = request.headers.get("origin");
  if (!appUrl || !origin) throw new Error("Request origin could not be verified.");
  try {
    const expected = new URL(appUrl);
    const received = new URL(origin);
    if (!(["http:", "https:"].includes(expected.protocol)) || expected.username || expected.password) throw new Error("Request origin could not be verified.");
    if (process.env.NODE_ENV === "production" && expected.protocol !== "https:") throw new Error("Request origin could not be verified.");
    if (received.origin !== origin || origin !== expected.origin) throw new Error("Request origin could not be verified.");
  } catch {
    throw new Error("Request origin could not be verified.");
  }
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const sql = getDb();
  await sql`WITH created AS (
              INSERT INTO auth_sessions(token_hash, user_id, expires_at)
              VALUES (${hashToken(token)}, ${userId}, ${expiresAt.toISOString()})
              RETURNING user_id
            )
            INSERT INTO security_audit_events(actor_user_id, subject_user_id, event_type)
            SELECT user_id, user_id, 'login_success' FROM created`;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  try {
    if (token) {
      const sql = getDb();
      await sql`WITH revoked AS (
                  UPDATE auth_sessions SET revoked_at = now()
                  WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
                  RETURNING user_id
                )
                INSERT INTO security_audit_events(actor_user_id, subject_user_id, event_type)
                SELECT user_id, user_id, 'logout' FROM revoked`;
    }
  } finally {
    jar.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sql = getDb();
  const rows = queryRows<SessionUser>(await sql`SELECT u.id, u.email, u.role, u.display_name, u.status,
                                u.email_verified_at, u.age_verified_at
                         FROM auth_sessions s
                         JOIN users u ON u.id = s.user_id
                         WHERE s.token_hash = ${hashToken(token)}
                           AND s.revoked_at IS NULL AND s.expires_at > now()
                         LIMIT 1`);
  return rows[0] ?? null;
}

export async function requireAgeVerificationUser(): Promise<SessionUser & { role: "client" | "model" }> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client" && user.role !== "model") notFound();
  if (!user.email_verified_at || user.status !== "pending" || user.age_verified_at) redirect(`/${user.role}`);
  return { ...user, role: user.role as "client" | "model" };
}

export async function requireRole(role: "client" | "model") {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== role) {
    if (user.role === "client" || user.role === "model") redirect(`/${user.role}`);
    notFound();
  }
  if (user.status !== "active" || !user.email_verified_at || !user.age_verified_at) redirect("/account-pending");
  if (!productionMarketplaceEnabled()) redirect("/preview-only");
  return user;
}
