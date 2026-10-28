import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

if (process.env.FORUMPAY_SANDBOX_START_RETRY_TEST === "true") {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "codex/forumpay-sandbox-checkout" ||
      process.env.FORUMPAY_SANDBOX_DATABASE_ISOLATED !== "true") throw new Error("Retry test requires isolated Preview.");
  const sql = neon(process.env.DATABASE_URL);
  const user = (await sql`SELECT id FROM users WHERE email='sandbox-buyer@example.test' AND display_name='Sandbox Test Buyer (synthetic)'`)[0];
  if (!user) throw new Error("Synthetic buyer missing.");
  const id = randomUUID();
  await sql.transaction([
    sql`INSERT INTO forumpay_sandbox_orders(id,user_id,request_key,package_id,amount_pence,tokens) VALUES (${id},${user.id},${id},'test-100',1000,100)`,
    sql`INSERT INTO forumpay_sandbox_retry_tests(order_id) VALUES (${id})`,
  ]);
  const webhook = new URL("/api/webhooks/forumpay/retry-test",process.env.APP_URL);
  webhook.searchParams.set("x-vercel-protection-bypass",process.env.FORUMPAY_WEBHOOK_BYPASS_SECRET);
  const fields = new URLSearchParams({
    pos_id:"widget", invoice_amount:"10.00",invoice_currency:"GBP",currency:"BTC",
    payer_id:user.id,payer_ip_address:"192.0.2.1",reference_no:id,webhook_url:webhook.href,
    accept_zero_confirmations:"false",
  });
  const r = await fetch("https://sandbox.api.forumpay.com/pay/v2/StartPayment/",{
    method:"POST",headers:{Authorization:"Basic "+Buffer.from(process.env.FORUMPAY_API_USERNAME.trim()+":"+process.env.FORUMPAY_API_PASSWORD).toString("base64"),
      "Content-Type":"application/x-www-form-urlencoded"},body:fields.toString(),redirect:"error",signal:AbortSignal.timeout(10_000),
  });
  const data=await r.json();
  if (!r.ok || data.err || typeof data.payment_id!=="string" || typeof data.address!=="string") {
    console.error("Sandbox retry StartPayment failed", {status:r.status,code:typeof data.code==="string"?data.code:"invalidResponse"});
    throw new Error("Unable to start sandbox retry payment.");
  }
  await sql`UPDATE forumpay_sandbox_orders SET state='pending',payment_id=${data.payment_id},currency='BTC',address=${data.address},updated_at=now() WHERE id=${id}`;
  console.log("Sandbox automatic-retry fixture started", {orderId:id,paymentId:data.payment_id});
  console.log("No funds sent. First notification will receive 503; subsequent notifications receive 200.");
}
