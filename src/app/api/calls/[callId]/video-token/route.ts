import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { productionMarketplaceEnabled } from "@/lib/release-gates";
import { createFundedVideoToken } from "@/lib/twilio-conversations";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ callId: string }> }) {
  try { assertSameOrigin(request); } catch { return jsonError("Request origin could not be verified.", 403); }
  const user = await getSessionUser();
  if (!user) return jsonError("Sign in to join a video call.", 401);
  if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) return jsonError("An active, age-verified account is required.", 403);
  if (!productionMarketplaceEnabled()) return jsonError("Video calls are unavailable until marketplace and payment gates are complete.", 503);
  if (!(await enforceRateLimit(request, `video-token:${user.id}`, 8, 900))) return rateLimitResponse();
  const { callId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(callId)) return jsonError("Video session not found.", 404);
  try {
    const sql = getDb();
    const call = queryRows<{ room_sid: string; charged_tokens: number }>(await sql`
      SELECT twilio_room_sid AS room_sid, charged_tokens FROM live_calls
      WHERE id = ${callId} AND status = 'active' AND twilio_room_sid IS NOT NULL
        AND (client_user_id = ${user.id} OR model_user_id = ${user.id})
        AND charged_tokens > 0
        AND EXISTS (SELECT 1 FROM users client WHERE client.id = client_user_id AND client.status = 'active' AND client.age_verified_at IS NOT NULL AND client.email_verified_at IS NOT NULL)
        AND EXISTS (SELECT 1 FROM users model WHERE model.id = model_user_id AND model.status = 'active' AND model.age_verified_at IS NOT NULL AND model.email_verified_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
          (b.blocker_user_id = client_user_id AND b.blocked_user_id = model_user_id)
          OR (b.blocker_user_id = model_user_id AND b.blocked_user_id = client_user_id))
      LIMIT 1`)[0];
    if (!call) return jsonError("This video session is not active or funded.", 404);
    const token = createFundedVideoToken(user.id, call.room_sid);
    return Response.json({ token, roomName: call.room_sid, expiresInSeconds: 1800 }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  } catch {
    return jsonError("Twilio Video token could not be issued.", 503);
  }
}
