import { z } from "zod";
import { getDb, queryRows } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { reconcileSandboxOrder, sandboxBuyer } from "@/lib/forumpay-checkout";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const auth = await sandboxBuyer(request);
    if ("response" in auth) return auth.response;
    const { orderId } = await context.params;
    if (!z.string().uuid().safeParse(orderId).success) return jsonError("Invalid order.", 400);
    const sql = getDb();
    const owned = queryRows<{ id: string }>(await sql`SELECT id FROM forumpay_sandbox_orders WHERE id = ${orderId} AND user_id = ${auth.user.id}`)[0];
    if (!owned) return jsonError("Order not found.", 404);
    await reconcileSandboxOrder(orderId);
    const order = queryRows(await sql`SELECT id, state, tokens, amount_pence FROM forumpay_sandbox_orders WHERE id = ${orderId}`)[0];
    return Response.json({ order }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("Payment status is temporarily unavailable.", 503); }
}
