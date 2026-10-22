import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, startSession, verifyPassword } from "@/lib/auth";
import { jsonError, normalizedEmail, rateLimitResponse, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";

export const runtime = "nodejs";

const inputSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = inputSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Email or password is incorrect.", 400);
    const email = normalizedEmail(parsed.data.email);
    if (!(await enforceRateLimit(request, "login-ip", 40, 900)) || !(await enforceRateLimit(request, `login-email:${email}`, 10, 900, false))) return rateLimitResponse();

    const sql = getDb();
    const rows = queryRows<{ id: string; email: string; password_hash: string | null; role: string; status: string; email_verified_at: string | null; age_verified_at: string | null }>(await sql`SELECT id, email, password_hash, role, status, email_verified_at, age_verified_at
                           FROM users WHERE lower(email) = ${email} LIMIT 1`);
    const user = rows[0];
    const matches = await verifyPassword(parsed.data.password, user?.password_hash);
    if (!user || !matches) return jsonError("Email or password is incorrect.", 401);
    if (user.role !== "client" && user.role !== "model") return jsonError("Email or password is incorrect.", 401);
    if (!user.email_verified_at) return jsonError("Verify your email address before signing in.", 403);
    if (user.status !== "active" && !(user.status === "pending" && !user.age_verified_at)) return jsonError("Email or password is incorrect.", 401);
    if (user.status === "active" && !user.age_verified_at) return jsonError("Your account is waiting for adult eligibility verification before access can be enabled.", 403);

    await startSession(user.id);
    return Response.json({ role: user.role }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Email or password is incorrect.", 400);
    return jsonError("Sign in is temporarily unavailable. Please try again later.", 503);
  }
}
