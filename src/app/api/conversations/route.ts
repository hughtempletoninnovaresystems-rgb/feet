import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { productionMarketplaceEnabled } from "@/lib/release-gates";
import { ensureTwilioConversation } from "@/lib/twilio-conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const startSchema = z.object({ targetUserId: z.string().uuid() });

async function currentMember(request?: Request) {
  const user = await getSessionUser();
  if (!user) return { response: jsonError("Sign in to use messages.", 401) } as const;
  if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) {
    return { response: jsonError("An active, age-verified account is required.", 403) } as const;
  }
  if (!productionMarketplaceEnabled()) return { response: jsonError("Messaging is unavailable until the marketplace launch gates are complete.", 503) } as const;
  if (request && !(await enforceRateLimit(request, `conversations:${user.id}`, 60, 900))) return { response: rateLimitResponse() } as const;
  return { user } as const;
}

export async function GET(request: Request) {
  const auth = await currentMember(request);
  if ("response" in auth) return auth.response;
  const sql = getDb();
  const rows = queryRows<{
    id: string; partner_user_id: string; partner_name: string; partner_handle: string;
    last_body: string | null; last_created_at: string | null;
  }>(await sql`
    SELECT c.id,
      CASE WHEN c.client_user_id = ${auth.user.id} THEN c.model_user_id ELSE c.client_user_id END AS partner_user_id,
      u.display_name AS partner_name,
      CASE WHEN c.client_user_id = ${auth.user.id} THEN mp.handle ELSE cp.handle END AS partner_handle,
      last_message.body AS last_body, last_message.created_at AS last_created_at
    FROM conversations c
    JOIN users u ON u.id = CASE WHEN c.client_user_id = ${auth.user.id} THEN c.model_user_id ELSE c.client_user_id END
    LEFT JOIN model_profiles mp ON mp.user_id = c.model_user_id
    LEFT JOIN client_profiles cp ON cp.user_id = c.client_user_id
    LEFT JOIN LATERAL (
      SELECT m.body, m.created_at FROM messages m
      WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND m.delivery_status = 'sent'
      ORDER BY m.created_at DESC LIMIT 1
    ) last_message ON true
    WHERE (c.client_user_id = ${auth.user.id} OR c.model_user_id = ${auth.user.id})
      AND c.twilio_conversation_sid IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
        (b.blocker_user_id = ${auth.user.id} AND b.blocked_user_id = CASE WHEN c.client_user_id = ${auth.user.id} THEN c.model_user_id ELSE c.client_user_id END)
        OR (b.blocked_user_id = ${auth.user.id} AND b.blocker_user_id = CASE WHEN c.client_user_id = ${auth.user.id} THEN c.model_user_id ELSE c.client_user_id END))
    ORDER BY COALESCE(last_message.created_at, c.created_at) DESC LIMIT 100`);
  return Response.json({ conversations: rows }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await currentMember(request);
    if ("response" in auth) return auth.response;
    const parsed = startSchema.safeParse(await readJson(request));
    if (!parsed.success || parsed.data.targetUserId === auth.user.id) return jsonError("Choose a valid member to message.", 400);
    const sql = getDb();
    const targets = queryRows<{ id: string; role: string }>(await sql`
      SELECT id, role FROM users WHERE id = ${parsed.data.targetUserId} AND status = 'active' AND closed_at IS NULL
        AND email_verified_at IS NOT NULL AND age_verified_at IS NOT NULL AND role IN ('client', 'model') LIMIT 1`);
    const target = targets[0];
    if (!target || target.role === auth.user.role) return jsonError("Choose an eligible member with the other account role.", 404);
    const clientId = auth.user.role === "client" ? auth.user.id : target.id;
    const modelId = auth.user.role === "model" ? auth.user.id : target.id;
    const pair = queryRows<{ allowed: boolean }>(await sql`
      SELECT EXISTS (
        SELECT 1 FROM client_profiles cp JOIN model_profiles mp ON mp.user_id = ${modelId}
        WHERE cp.user_id = ${clientId} AND mp.discoverable = true
      ) AND NOT EXISTS (SELECT 1 FROM user_blocks WHERE
        (blocker_user_id = ${clientId} AND blocked_user_id = ${modelId}) OR (blocker_user_id = ${modelId} AND blocked_user_id = ${clientId})) AS allowed`)[0]?.allowed;
    if (!pair) return jsonError("This conversation is unavailable.", 403);
    const rows = queryRows<{ id: string; twilio_conversation_sid: string | null }>(await sql`
      INSERT INTO conversations(client_user_id, model_user_id)
      VALUES (${clientId}, ${modelId})
      ON CONFLICT (client_user_id, model_user_id) DO UPDATE SET client_user_id = EXCLUDED.client_user_id
      RETURNING id, twilio_conversation_sid`);
    const row = rows[0];
    if (!row) return jsonError("This conversation could not be started.", 503);
    const twilioSid = row.twilio_conversation_sid ?? await ensureTwilioConversation(row.id, [clientId, modelId]);
    await sql`UPDATE conversations SET twilio_conversation_sid = ${twilioSid} WHERE id = ${row.id} AND twilio_conversation_sid IS NULL`;
    return Response.json({ conversationId: row.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Choose a valid member to message.", 400);
    return jsonError("Messaging service is unavailable. Check Twilio Conversations setup.", 503);
  }
}
