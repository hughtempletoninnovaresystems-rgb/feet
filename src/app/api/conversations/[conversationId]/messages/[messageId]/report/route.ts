import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string; messageId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in to report a message.", 401);
    if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) return jsonError("An active, age-verified account is required.", 403);
    if (!productionMarketplaceEnabled()) return jsonError("Messaging is unavailable until the marketplace launch gates are complete.", 503);
    if (!(await enforceRateLimit(request, `message-report:${user.id}`, 15, 900))) return rateLimitResponse();
    const { conversationId, messageId } = await params;
    if (![conversationId, messageId].every((id) => /^[0-9a-f-]{36}$/i.test(id))) return jsonError("Message not found.", 404);
    const sql = getDb();
    const message = queryRows<{ id: string; sender_user_id: string }>(await sql`
      SELECT m.id, m.sender_user_id FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = ${messageId} AND c.id = ${conversationId} AND m.sender_user_id <> ${user.id}
        AND (c.client_user_id = ${user.id} OR c.model_user_id = ${user.id}) AND m.delivery_status = 'sent'
      LIMIT 1`)[0];
    if (!message) return jsonError("Message not found.", 404);
    await sql`INSERT INTO reports(reporter_user_id, reported_user_id, target_kind, target_id, reason)
              VALUES (${user.id}, ${message.sender_user_id}, 'message', ${message.id}, 'Member reported a message')`;
    return Response.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    return jsonError("This message could not be reported.", 503);
  }
}
