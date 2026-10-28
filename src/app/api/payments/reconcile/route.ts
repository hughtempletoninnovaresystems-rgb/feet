import { timingSafeEqual } from "node:crypto";
import { getDb, queryRows } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { forumPaySandboxEnabled } from "@/lib/forumpay";
import { reconcileSandboxOrder } from "@/lib/forumpay-checkout";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.FORUMPAY_RECONCILIATION_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + (secret ?? ""));
  if (!secret || secret.length < 32 || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return jsonError("Unauthorized.", 401);
  if (!forumPaySandboxEnabled()) return jsonError("Sandbox disabled.", 503);
  const sql = getDb();
  const orders = queryRows<{ order_id: string }>(await sql`SELECT DISTINCT order_id FROM forumpay_sandbox_notifications WHERE processed_at IS NULL AND attempts < 20 LIMIT 20`);
  let completed = 0;
  for (const order of orders) {
    try { await reconcileSandboxOrder(order.order_id); completed++; } catch { /* Keep durable receipt available for retry. */ }
  }
  return Response.json({ checked: completed, pending: orders.length - completed });
}
