import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { createYotiAgeSession, getYotiCredentials } from "@/lib/yoti";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in to verify your age.", 401);
    if ((user.role !== "client" && user.role !== "model") || !user.email_verified_at || user.status !== "pending" || user.age_verified_at) {
      return jsonError("This account cannot start age verification.", 403);
    }
    if (!(await enforceRateLimit(request, `yoti-session:${user.id}`, 5, 3600))) return rateLimitResponse();
    const credentials = getYotiCredentials();
    if (!credentials) return jsonError("Adult eligibility verification is not configured yet.", 503);

    const sql = getDb();
    const rows = queryRows<{ id: string; reference_id: string }>(await sql`
      WITH expired AS (
        UPDATE age_verification_sessions SET status = 'expired', updated_at = now()
        WHERE user_id = ${user.id} AND status IN ('creating', 'pending', 'in_progress') AND expires_at <= now()
        RETURNING id
      )
      INSERT INTO age_verification_sessions(user_id, reference_id, status, expires_at)
      VALUES (${user.id}, gen_random_uuid()::text, 'creating', now() + interval '15 minutes')
      RETURNING id, reference_id`);
    const session = rows[0];
    if (!session) return jsonError("Could not start age verification.", 503);

    try {
      const providerSession = await createYotiAgeSession(credentials, session.reference_id);
      await sql`UPDATE age_verification_sessions
                SET provider_session_id = ${providerSession.id}, status = 'pending',
                    expires_at = ${providerSession.expires_at}, updated_at = now()
                WHERE id = ${session.id} AND user_id = ${user.id} AND status = 'creating'`;
      const sessionUrl = new URL("https://age.yoti.com/");
      sessionUrl.searchParams.set("sessionId", providerSession.id);
      sessionUrl.searchParams.set("sdkId", credentials.sdkId);
      sessionUrl.searchParams.set("locale", "en-GB");
      return Response.json({ sessionUrl: sessionUrl.toString() }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      await sql`UPDATE age_verification_sessions SET status = 'error', updated_at = now() WHERE id = ${session.id} AND status = 'creating'`;
      return jsonError("Could not start age verification. Please try again later.", 503);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return jsonError("An age verification session is already in progress. Continue that check or try again shortly.", 409);
    }
    return jsonError("Could not start age verification. Please try again later.", 503);
  }
}
