import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, hashPassword, hashToken } from "@/lib/auth";
import { jsonError, rateLimitResponse, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";

export const runtime = "nodejs";
const inputSchema = z.object({ token: z.string().min(32).max(128), password: z.string().min(12).max(128) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!(await enforceRateLimit(request, "reset-password", 10, 900))) return rateLimitResponse();
    const parsed = inputSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Choose a password with at least 12 characters and use a valid reset link.", 400);
    const passwordHash = await hashPassword(parsed.data.password);
    const tokenHash = hashToken(parsed.data.token);
    const sql = getDb();
    const rows = queryRows<{ id: string }>(await sql`
      WITH consumed AS (
        UPDATE password_reset_tokens
        SET used_at = now()
        WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
        RETURNING user_id
      ), updated_user AS (
        UPDATE users u
        SET password_hash = ${passwordHash}, updated_at = now()
        FROM consumed c
        WHERE u.id = c.user_id
        RETURNING u.id
      ), revoked_sessions AS (
        UPDATE auth_sessions s
        SET revoked_at = now()
        FROM updated_user u
        WHERE s.user_id = u.id AND s.revoked_at IS NULL
        RETURNING s.token_hash
      ), audit_event AS (
        INSERT INTO security_audit_events(actor_user_id, subject_user_id, event_type)
        SELECT id, id, 'password_reset' FROM updated_user RETURNING id
      )
      SELECT id FROM updated_user`);
    if (!rows.length) return jsonError("This reset link is invalid or expired.", 400);
    return Response.json({ message: "Password changed. Sign in with your new password." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Use a valid reset link and password.", 400);
    return jsonError("Could not reset the password. Please try again later.", 503);
  }
}
