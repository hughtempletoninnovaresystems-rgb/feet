import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, hashToken } from "@/lib/auth";
import { jsonError, rateLimitResponse, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";

export const runtime = "nodejs";

const inputSchema = z.object({ token: z.string().min(32).max(128) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!(await enforceRateLimit(request, "verify-email", 20, 900))) return rateLimitResponse();
    const parsed = inputSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("This verification link is invalid or expired.", 400);
    const tokenHash = hashToken(parsed.data.token);
    const sql = getDb();
    const rows = queryRows<{ email_verified_at: string; age_verified_at: string | null }>(await sql`
      WITH consumed AS (
        UPDATE email_verification_tokens
        SET used_at = now()
        WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
        RETURNING user_id
      ), updated_user AS (
      UPDATE users u
      SET email_verified_at = COALESCE(u.email_verified_at, now()),
          status = CASE
            WHEN u.status IN ('restricted', 'suspended', 'closed') THEN u.status
            WHEN u.age_verified_at IS NOT NULL THEN 'active'
            ELSE 'pending'
          END,
          updated_at = now()
      FROM consumed c
      WHERE u.id = c.user_id
      RETURNING u.id, u.email_verified_at, u.age_verified_at
      ), audit_event AS (
        INSERT INTO security_audit_events(actor_user_id, subject_user_id, event_type)
        SELECT id, id, 'email_verified' FROM updated_user RETURNING id
      )
      SELECT email_verified_at, age_verified_at FROM updated_user`);
    const result = rows[0];
    if (!result) return jsonError("This verification link is invalid or expired.", 400);
    if (!result.age_verified_at) {
      return Response.json({ message: "Email verified. Account access remains locked until an approved adult verification flow is configured." }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ message: "Email verified. You can now sign in." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("This verification link is invalid or expired.", 400);
    return jsonError("Could not verify this email address. Please try again later.", 503);
  }
}
