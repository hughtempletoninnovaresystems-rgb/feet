import { enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { getYotiAgeResult, getYotiCredentials, yotiStatusToLocal } from "@/lib/yoti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in to check age verification.", 401);
    if ((user.role !== "client" && user.role !== "model") || !user.email_verified_at) return jsonError("This account cannot check age verification.", 403);
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (sessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return jsonError("This verification session is invalid.", 400);
    }
    if (!(await enforceRateLimit(request, `yoti-status:${user.id}`, 30, 900))) return rateLimitResponse();
    const sql = getDb();
    const sessions = queryRows<{ id: string; reference_id: string; provider_session_id: string; status: string; expires_at: string }>(sessionId ? await sql`
      SELECT id, reference_id, provider_session_id, status, expires_at
      FROM age_verification_sessions
      WHERE user_id = ${user.id} AND provider_session_id = ${sessionId}
      LIMIT 1` : await sql`
      SELECT id, reference_id, provider_session_id, status, expires_at
      FROM age_verification_sessions
      WHERE user_id = ${user.id} AND provider_session_id IS NOT NULL AND status IN ('creating', 'pending', 'in_progress')
      ORDER BY created_at DESC LIMIT 1`);
    const session = sessions[0];
    if (!session) return Response.json({ status: "cancelled" }, { headers: { "Cache-Control": "no-store" } });
    if (session.status === "complete" || session.status === "failed" || session.status === "error" || session.status === "cancelled" || session.status === "expired") {
      return Response.json({ status: session.status }, { headers: { "Cache-Control": "no-store" } });
    }
    if (Date.parse(session.expires_at) <= Date.now()) {
      await sql`UPDATE age_verification_sessions SET status = 'expired', updated_at = now() WHERE id = ${session.id} AND status IN ('creating', 'pending', 'in_progress')`;
      return Response.json({ status: "expired" }, { headers: { "Cache-Control": "no-store" } });
    }
    const credentials = getYotiCredentials();
    if (!credentials) return jsonError("Adult eligibility verification is temporarily unavailable.", 503);
    const providerResult = await getYotiAgeResult(credentials, session.provider_session_id);
    if (providerResult.id !== session.provider_session_id || providerResult.sdk_id !== credentials.sdkId ||
        providerResult.reference_id !== session.reference_id || providerResult.type !== "OVER") {
      return jsonError("The verification result could not be confirmed.", 502);
    }
    const status = yotiStatusToLocal(providerResult.status);
    if (!status) return jsonError("The verification result could not be confirmed.", 502);

    if (status === "complete") {
      await sql`WITH verified_session AS (
                  UPDATE age_verification_sessions
                  SET status = 'complete', completed_at = COALESCE(completed_at, now()), updated_at = now()
                  WHERE id = ${session.id} AND user_id = ${user.id} AND status <> 'complete'
                  RETURNING user_id
                ), verified_user AS (
                  UPDATE users u
                  SET age_verified_at = COALESCE(u.age_verified_at, now()),
                      status = CASE WHEN u.status = 'pending' THEN 'active' ELSE u.status END,
                      updated_at = now()
                  FROM verified_session s
                  WHERE u.id = s.user_id AND u.email_verified_at IS NOT NULL AND u.status IN ('pending', 'active')
                  RETURNING u.id
                ), audit_event AS (
                  INSERT INTO security_audit_events(actor_user_id, subject_user_id, event_type)
                  SELECT id, id, 'age_verified_yoti' FROM verified_user RETURNING id
                ) SELECT id FROM verified_user`;
    } else {
      await sql`UPDATE age_verification_sessions SET status = ${status}, updated_at = now()
                WHERE id = ${session.id} AND user_id = ${user.id} AND status <> 'complete'`;
    }
    return Response.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("Could not check age verification right now. Please try again.", 503);
  }
}
