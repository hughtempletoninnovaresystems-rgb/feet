import { neon } from "@neondatabase/serverless";

if (process.env.FORUMPAY_SANDBOX_TEST_WEBHOOK === "true") {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "codex/forumpay-sandbox-checkout" ||
      process.env.FORUMPAY_SANDBOX_DATABASE_ISOLATED !== "true") throw new Error("Webhook test requires the isolated Preview branch.");
  const sql = neon(process.env.DATABASE_URL);
  const order = (await sql`SELECT id,payment_id,currency,address FROM forumpay_sandbox_orders
    WHERE id='49cfba8b-97dd-486f-9502-d2bd94316612' AND state='confirmed'`)[0];
  if (!order) throw new Error("Confirmed test order missing.");
  const url = new URL("/api/webhooks/forumpay", process.env.APP_URL);
  const headers = { "Content-Type": "application/json", "x-vercel-protection-bypass": process.env.FORUMPAY_WEBHOOK_BYPASS_SECRET };
  async function post(payload) {
    const start = Date.now();
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), redirect: "error", signal: AbortSignal.timeout(15_000) });
    console.log("Webhook live HTTP test", { status: r.status, latencyMs: Date.now() - start });
    return r.status;
  }
  if (await post({}) !== 400) throw new Error("Webhook validation test failed.");
  const payload = { reference_no: order.id, payment_id: order.payment_id, currency: order.currency, address: order.address, pos_id: "widget" };
  const before = (await sql`SELECT COALESCE(sum(delivery_count),0)::int AS count FROM forumpay_sandbox_notifications WHERE order_id=${order.id}`)[0].count;
  for (let i=0;i<3;i++) if (await post(payload) !== 200) throw new Error("Webhook replay was not acknowledged.");
  const after = (await sql`SELECT COALESCE(sum(delivery_count),0)::int AS count FROM forumpay_sandbox_notifications WHERE order_id=${order.id}`)[0].count;
  const credits = (await sql`SELECT count(*)::int AS count, sum(tokens)::int AS tokens FROM forumpay_sandbox_credits WHERE order_id=${order.id}`)[0];
  if (after < before+3 || credits.count !== 1 || credits.tokens !== 100) throw new Error("Webhook replay persistence/idempotency test failed.");
  console.log("Webhook live delivery passed: three replays persisted; one credit, 100 test tokens. Sender was this test script, not ForumPay.");
}
