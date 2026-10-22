import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { productionMarketplaceEnabled } from "@/lib/release-gates";
import { sendTwilioConversationMessage } from "@/lib/twilio-conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const messageSchema = z.object({ body: z.string().trim().min(1).max(1600), requestId: z.string().uuid() });

async function authorizedConversation(request: Request, conversationId: string) {
  const user = await getSessionUser();
  if (!user) return { response: jsonError("Sign in to use messages.", 401) } as const;
  if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) return { response: jsonError("An active, age-verified account is required.", 403) } as const;
  if (!productionMarketplaceEnabled()) return { response: jsonError("Messaging is unavailable until the marketplace launch gates are complete.", 503) } as const;
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return { response: jsonError("Conversation not found.", 404) } as const;
  const maxHits = request.method === "GET" ? 120 : 45;
  if (!(await enforceRateLimit(request, `conversation-messages:${user.id}:${request.method}`, maxHits, 900))) return { response: rateLimitResponse() } as const;
  const sql = getDb();
  const rows = queryRows<{ id: string; sid: string; other_user_id: string }>(await sql`
    SELECT c.id, c.twilio_conversation_sid AS sid,
      CASE WHEN c.client_user_id = ${user.id} THEN c.model_user_id ELSE c.client_user_id END AS other_user_id
    FROM conversations c
    WHERE c.id = ${conversationId} AND (c.client_user_id = ${user.id} OR c.model_user_id = ${user.id})
      AND c.twilio_conversation_sid IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
        (b.blocker_user_id = ${user.id} AND b.blocked_user_id = CASE WHEN c.client_user_id = ${user.id} THEN c.model_user_id ELSE c.client_user_id END)
        OR (b.blocked_user_id = ${user.id} AND b.blocker_user_id = CASE WHEN c.client_user_id = ${user.id} THEN c.model_user_id ELSE c.client_user_id END))
    LIMIT 1`);
  const conversation = rows[0];
  if (!conversation) return { response: jsonError("Conversation not found or unavailable.", 404) } as const;
  return { user, conversation } as const;
}

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const auth = await authorizedConversation(request, conversationId);
  if ("response" in auth) return auth.response;
  const sql = getDb();
  const messages = queryRows<{ id: string; sender_user_id: string; body: string; created_at: string }>(await sql`
    SELECT id, sender_user_id, body, created_at FROM messages
    WHERE conversation_id = ${auth.conversation.id} AND deleted_at IS NULL AND delivery_status = 'sent'
    ORDER BY created_at DESC LIMIT 100`);
  return Response.json({ messages: messages.reverse() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    assertSameOrigin(request);
    const { conversationId } = await params;
    const auth = await authorizedConversation(request, conversationId);
    if ("response" in auth) return auth.response;
    const parsed = messageSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Messages must contain 1–1,600 characters and a request ID.", 400);
    const sql = getDb();
    const existing = queryRows<{ id: string; body: string; conversation_id: string; delivery_status: string }>(await sql`
      SELECT id, body, conversation_id, delivery_status FROM messages
      WHERE sender_user_id = ${auth.user.id} AND client_request_id = ${parsed.data.requestId} LIMIT 1`)[0];
    if (existing) {
      if (existing.body !== parsed.data.body || existing.conversation_id !== auth.conversation.id) return jsonError("This request ID was already used for a different message.", 409);
      if (existing.delivery_status === "sent") return Response.json({ messageId: existing.id, duplicate: true }, { headers: { "Cache-Control": "no-store" } });
      return jsonError("This message is already being processed. Refresh the conversation before retrying.", 409);
    }
    const rows = queryRows<{ id: string }>(await sql`
      INSERT INTO messages(conversation_id, sender_user_id, body, client_request_id, delivery_status)
      VALUES (${auth.conversation.id}, ${auth.user.id}, ${parsed.data.body}, ${parsed.data.requestId}, 'pending')
      ON CONFLICT (sender_user_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
      RETURNING id`);
    const message = rows[0];
    if (!message) return jsonError("This message is already being processed. Refresh the conversation before retrying.", 409);
    try {
      const sent = await sendTwilioConversationMessage({
        conversationSid: auth.conversation.sid,
        senderId: auth.user.id,
        body: parsed.data.body,
        requestId: parsed.data.requestId,
      });
      await sql`UPDATE messages SET twilio_message_sid = ${sent.sid}, delivery_status = 'sent'
                WHERE id = ${message.id} AND delivery_status = 'pending'`;
      return Response.json({ messageId: message.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch {
      await sql`UPDATE messages SET delivery_status = 'failed', delivery_error = 'provider delivery failed'
                WHERE id = ${message.id} AND delivery_status = 'pending'`;
      return jsonError("The message could not be delivered. Please try again.", 503);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Check the message and try again.", 400);
    return jsonError("The message could not be sent.", 503);
  }
}
