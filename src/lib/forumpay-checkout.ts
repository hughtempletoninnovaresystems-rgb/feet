import "server-only";
import { getSessionUser, enforceRateLimit } from "@/lib/auth";
import { jsonError, rateLimitResponse } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { checkForumPaySandboxPayment, forumPaySandboxEnabled } from "@/lib/forumpay";
import { verifiedPaymentMatches } from "@/lib/forumpay-validation";

export async function sandboxBuyer(request: Request) {
  if (!forumPaySandboxEnabled()) return { response: jsonError("Sandbox checkout is unavailable.", 503) } as const;
  const user = await getSessionUser();
  if (!user) return { response: jsonError("Sign in to test checkout.", 401) } as const;
  if (user.role !== "client" || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) {
    return { response: jsonError("An active, age-verified client account is required.", 403) } as const;
  }
  if (!(await enforceRateLimit(request, `sandbox-payment:${user.id}`, 60, 60))) return { response: rateLimitResponse() } as const;
  return { user } as const;
}

export async function reconcileSandboxOrder(orderId: string) {
  const sql = getDb();
  // Only identifiers durably saved by the notification inbox are used.
  const notifications = queryRows<{ id: string; payment_id: string; currency: string; address: string }>(await sql`
    SELECT id, payment_id, currency, address FROM forumpay_sandbox_notifications
    WHERE order_id = ${orderId} AND processed_at IS NULL AND attempts < 20
    ORDER BY received_at LIMIT 3`);
  for (const event of notifications) {
    await sql`UPDATE forumpay_sandbox_notifications SET attempts = attempts + 1 WHERE id = ${event.id}`;
    const data = await checkForumPaySandboxPayment({ paymentId: event.payment_id, currency: event.currency, address: event.address });
    const order = queryRows<{ id: string; amount_pence: number }>(await sql`SELECT id, amount_pence FROM forumpay_sandbox_orders WHERE id = ${orderId}`)[0];
    if (!order || data.reference_no !== order.id) {
      await sql`UPDATE forumpay_sandbox_notifications SET processed_at = now() WHERE id = ${event.id}`;
      continue;
    }
    if (verifiedPaymentMatches(data, order)) {
      // One statement commits the terminal state and its unique sandbox credit.
      // UPDATE serializes concurrent polls and duplicate notifications.
      await sql`
        WITH confirmed AS (
          UPDATE forumpay_sandbox_orders SET state = 'confirmed', payment_id = ${event.payment_id},
            currency = ${event.currency}, address = ${event.address}, updated_at = now()
          WHERE id = ${order.id} AND state <> 'confirmed'
          RETURNING id, user_id, tokens
        )
        INSERT INTO forumpay_sandbox_credits(order_id, user_id, tokens)
        SELECT id, user_id, tokens FROM confirmed
        ON CONFLICT (order_id) DO NOTHING`;
      await sql`UPDATE forumpay_sandbox_notifications SET processed_at = now() WHERE id = ${event.id}`;
    } else if (data.confirmed === true || data.cancelled === true) {
      await sql`UPDATE forumpay_sandbox_orders SET state = ${data.confirmed === true ? "review" : "cancelled"},
        updated_at = now() WHERE id = ${order.id} AND state <> 'confirmed'`;
      await sql`UPDATE forumpay_sandbox_notifications SET processed_at = now() WHERE id = ${event.id}`;
    }
  }
}
