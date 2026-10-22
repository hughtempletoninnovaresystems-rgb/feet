import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPrivateValue, startSession } from "@/lib/auth";
import { normalizedEmail } from "@/lib/api";
import { issueVerificationEmail } from "@/lib/auth-emails";
import { getDb, queryRows } from "@/lib/db";
import {
  appOrigin,
  exchangeOAuthCode,
  getOAuthConfiguration,
  oauthCookieName,
  readOAuthAttemptCookie,
  type OAuthProvider,
} from "@/lib/oauth-providers";
import { productionSignupsEnabled } from "@/lib/release-gates";

export const runtime = "nodejs";

type OAuthUser = {
  id: string;
  email: string;
  role: string;
  status: string;
  email_verified_at: string | null;
  age_verified_at: string | null;
};

function isProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "facebook";
}

function authRedirect(path: string) {
  return NextResponse.redirect(new URL(path, appOrigin()), { headers: { "Cache-Control": "no-store" } });
}

function finish(response: NextResponse, provider: OAuthProvider) {
  response.cookies.set(oauthCookieName(provider), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/api/auth/oauth/${provider}/callback`,
    expires: new Date(0),
  });
  return response;
}

function publicName(value: string | null, email: string) {
  const candidate = value?.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80);
  if (candidate) return candidate;
  return email.split("@", 1)[0].slice(0, 80) || "Member";
}

function validEmail(value: string | null): value is string {
  return typeof value === "string" && z.string().email().max(254).safeParse(value).success;
}

async function createSocialAccount(request: Request, provider: OAuthProvider, subject: string, email: string, displayName: string, role: "client" | "model") {
  const normalized = normalizedEmail(email);
  const ip = request.headers.get("x-real-ip")?.trim();
  const userAgent = request.headers.get("user-agent");
  const ipHash = ip ? hashPrivateValue(ip) : null;
  const userAgentHash = userAgent ? hashPrivateValue(userAgent) : null;
  const termsVersion = process.env.LEGAL_TERMS_VERSION || "draft-2026-10-22";
  const privacyVersion = process.env.LEGAL_PRIVACY_VERSION || "draft-2026-10-22";
  const sql = getDb();
  const rows = queryRows<{ id: string; email: string }>(await sql`
    WITH new_user AS (
      INSERT INTO users(email, role, display_name)
      VALUES (${normalized}, ${role}, ${displayName})
      RETURNING id, email
    ), new_client_profile AS (
      INSERT INTO client_profiles(user_id, handle)
      SELECT id, '@' || COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(${displayName}), '[^a-z0-9]+', '-', 'g')), ''), 'member')
        || '-' || left(replace(id::text, '-', ''), 8)
      FROM new_user WHERE ${role} = 'client'
      RETURNING user_id
    ), new_model_profile AS (
      INSERT INTO model_profiles(user_id, handle)
      SELECT id, '@' || COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(${displayName}), '[^a-z0-9]+', '-', 'g')), ''), 'creator')
        || '-' || left(replace(id::text, '-', ''), 8)
      FROM new_user WHERE ${role} = 'model'
      RETURNING user_id
    ), new_identity AS (
      INSERT INTO auth_identities(user_id, provider, provider_subject)
      SELECT id, ${provider}, ${subject} FROM new_user
      RETURNING user_id
    ), accepted_terms AS (
      INSERT INTO legal_acceptances(user_id, document_key, document_version, ip_hash, user_agent_hash)
      SELECT id, 'terms', ${termsVersion}, ${ipHash}, ${userAgentHash} FROM new_user
      RETURNING user_id
    ), accepted_privacy AS (
      INSERT INTO legal_acceptances(user_id, document_key, document_version, ip_hash, user_agent_hash)
      SELECT id, 'privacy', ${privacyVersion}, ${ipHash}, ${userAgentHash} FROM new_user
      RETURNING user_id
    ), audit_event AS (
      INSERT INTO security_audit_events(actor_user_id, subject_user_id, event_type)
      SELECT id, id, 'account_registered' FROM new_user
      RETURNING id
    )
    SELECT id, email FROM new_user
  `);
  return rows[0] ?? null;
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerParam } = await context.params;
  if (!isProvider(providerParam)) return new Response("Not found", { status: 404 });
  const provider = providerParam;
  const url = new URL(request.url);
  const jar = await cookies();
  const attempt = readOAuthAttemptCookie(jar.get(oauthCookieName(provider))?.value, provider, url.searchParams.get("state"));
  const clearAndRedirect = (path: string) => finish(authRedirect(path), provider);

  if (!attempt) return clearAndRedirect("/login?oauth=failed");
  if (url.searchParams.has("error") || !url.searchParams.get("code")) return clearAndRedirect(attempt.flow === "register" ? "/register?oauth=cancelled" : "/login?oauth=cancelled");

  try {
    const configuration = getOAuthConfiguration(provider);
    if (!configuration) return clearAndRedirect("/login?oauth=unavailable");
    const profile = await exchangeOAuthCode(provider, url.searchParams.get("code")!, attempt, configuration);
    const sql = getDb();
    const linked = queryRows<OAuthUser>(await sql`
      SELECT u.id, u.email, u.role, u.status, u.email_verified_at, u.age_verified_at
      FROM auth_identities i
      JOIN users u ON u.id = i.user_id
      WHERE i.provider = ${provider} AND i.provider_subject = ${profile.subject}
      LIMIT 1
    `)[0];

    if (attempt.flow === "login") {
      if (!linked || (linked.role !== "client" && linked.role !== "model")) return clearAndRedirect("/login?oauth=not-linked");
      if (!linked.email_verified_at) {
        try { await issueVerificationEmail(linked.id, linked.email); } catch { /* Keep the response generic. */ }
        return clearAndRedirect("/login?oauth=verify-email");
      }
      if (linked.status !== "active" && !(linked.status === "pending" && !linked.age_verified_at)) return clearAndRedirect("/login?oauth=unavailable");
      if (linked.status === "active" && !linked.age_verified_at) return clearAndRedirect("/login?oauth=age-check");
      await startSession(linked.id);
      return finish(NextResponse.redirect(new URL(`/${linked.role}`, appOrigin()), { headers: { "Cache-Control": "no-store" } }), provider);
    }

    if (!productionSignupsEnabled() || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.APP_URL) {
      return clearAndRedirect("/register?oauth=registration-closed");
    }
    if (!validEmail(profile.email)) return clearAndRedirect("/register?oauth=email-required");
    if (linked) return clearAndRedirect("/login?oauth=existing-account");

    const user = await createSocialAccount(request, provider, profile.subject, profile.email, publicName(profile.displayName, profile.email), attempt.role!);
    if (!user) return clearAndRedirect("/register?oauth=unavailable");
    try { await issueVerificationEmail(user.id, user.email); } catch { /* The account remains pending and can request another email. */ }
    return clearAndRedirect("/login?oauth=verify-email");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return clearAndRedirect(attempt.flow === "register" ? "/login?oauth=existing-account" : "/login?oauth=unavailable");
    }
    return clearAndRedirect(attempt.flow === "register" ? "/register?oauth=unavailable" : "/login?oauth=unavailable");
  }
}
