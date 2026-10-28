import { createHash } from "node:crypto";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { forumPaySandboxEnabled, getForumPayConfiguration } from "@/lib/forumpay";

export const runtime = "nodejs";
const notification = z.object({
  reference_no: z.string().uuid(), payment_id: z.string().min(1).max(100),
  pos_id: z.string().max(36), currency: z.string().regex(/^[A-Z0-9_]{1,40}$/),
  address: z.string().min(1).max(256),
});
export async function POST(request: Request) {
  if (!forumPaySandboxEnabled()) return jsonError("Sandbox notifications unavailable.", 503);
  try {
    const parsed = notification.safeParse(await readJson(request, 4096));
    if (!parsed.success) return jsonError("Invalid notification.", 400);
    const event = parsed.data;
    if (event.pos_id !== getForumPayConfiguration()?.posId) return jsonError("Unknown point of service.", 400);
    const id = createHash("sha256").update(JSON.stringify([event.reference_no, event.payment_id, event.currency, event.address])).digest("hex");
    // Durably enqueue only. The authenticated CheckPayment API establishes trust,
    // never this unsigned payload. No wallet mutation happens in this handler.
    const sql = getDb();
    await sql`INSERT INTO forumpay_sandbox_notifications(id, order_id, payment_id, currency, address)
      SELECT ${id}, id, ${event.payment_id}, ${event.currency}, ${event.address}
      FROM forumpay_sandbox_orders WHERE id = ${event.reference_no}
      ON CONFLICT (id) DO UPDATE SET processed_at = NULL, attempts = 0`;
    return new Response("OK", { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonError("Invalid JSON.", 400);
    return jsonError("Notification could not be persisted.", 503);
  }
}
