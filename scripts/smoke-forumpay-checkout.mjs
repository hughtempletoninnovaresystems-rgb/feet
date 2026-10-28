import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

if (process.env.FORUMPAY_SANDBOX_SMOKE_CHECKOUT === "true") {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "codex/forumpay-sandbox-checkout" ||
      process.env.FORUMPAY_SANDBOX_DATABASE_ISOLATED !== "true") throw new Error("Smoke checkout requires the isolated Preview branch.");
  const sql = neon(process.env.DATABASE_URL);
  const users = await sql`SELECT id FROM users WHERE email = 'sandbox-buyer@example.test' AND display_name = 'Sandbox Test Buyer (synthetic)'`;
  if (!users[0]) throw new Error("Synthetic sandbox buyer is missing.");
  const id = randomUUID();
  await sql`INSERT INTO forumpay_sandbox_orders(id,user_id,request_key,package_id,amount_pence,tokens)
    VALUES (${id},${users[0].id},${id},'test-100',1000,100)`;
  const origin = new URL(process.env.APP_URL);
  const fields = new URLSearchParams({
    pos_id: process.env.FORUMPAY_POS_ID,
    invoice_amount: "10.00", invoice_currency: "GBP", reference_no: id,
    widget_type: "0", secure_link: "true", allow_multiple_payments: "false",
    accept_zero_confirmations: "false", auto_accept_underpayment: "false",
    auto_accept_overpayment: "false", auto_accept_late_payment: "false",
    auto_accept_other_currency: "false",
    webhook_url: new URL("/api/webhooks/forumpay",origin).href,
    redirect_url_on_success: new URL("/sandbox/checkout",origin).href,
    redirect_url_on_failure: new URL("/sandbox/checkout",origin).href,
  });
  const response = await fetch("https://sandbox.api.forumpay.com/pay/v2/CreatePaymentLink/", {
    method: "POST", headers: { Authorization: "Basic " + Buffer.from(process.env.FORUMPAY_API_USERNAME.trim() + ":" + process.env.FORUMPAY_API_PASSWORD).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded" }, body: fields.toString(), redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json();
  const safe = v => typeof v === "string" && /^[A-Za-z0-9_. -]{1,100}$/.test(v) ? v : "unspecified";
  if (!response.ok || data.err) {
    console.error("ForumPay checkout diagnostic", { status: response.status, code: safe(data.code), field: safe(data.additional?.field), reason: safe(data.additional?.reason) });
    throw new Error("ForumPay sandbox checkout rejected. No test tokens credited.");
  }
  // Print structure and host only; never a provider access token or full URL.
  console.log("ForumPay checkout response", { fields: Object.keys(data), urlType: typeof data.url,
    host: typeof data.url === "string" ? new URL(data.url).hostname : "missing" });
  const url = new URL(data.url);
  if (url.protocol !== "https:" || url.hostname !== "sandbox.widget.forumpay.com" || url.port || url.username || url.password) throw new Error("Unexpected sandbox checkout host.");
  await sql`UPDATE forumpay_sandbox_orders SET checkout_url=${url.href},state='pending',updated_at=now() WHERE id=${id}`;
  console.log("Sandbox checkout smoke test passed; synthetic buyer has a pending payment link.");
}
