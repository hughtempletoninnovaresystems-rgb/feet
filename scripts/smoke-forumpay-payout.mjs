import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import ts from "typescript";

if (process.env.FORUMPAY_SANDBOX_PAYOUT_SMOKE === "true") {
  if (process.env.VERCEL_ENV!=="preview" || process.env.VERCEL_GIT_COMMIT_REF!=="codex/forumpay-sandbox-checkout" ||
      process.env.FORUMPAY_SANDBOX_DATABASE_ISOLATED!=="true") throw new Error("Payout smoke test requires isolated Preview.");
  const require=createRequire(import.meta.url);
  function load(path,mocks={}) {
    const compiled={exports:{}};
    const code=ts.transpileModule(readFileSync(new URL("../"+path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{module:compiled,exports:compiled.exports,require:name=>name==="server-only"?{}:name in mocks?mocks[name]:require(name),
      process,Buffer,URL,URLSearchParams,AbortSignal,fetch,console,Error,SyntaxError},{filename:path});
    return compiled.exports;
  }
  const sql=neon(process.env.DATABASE_URL);
  const api=load("src/lib/forumpay.ts");
  const validation=load("src/lib/forumpay-payout-validation.ts",{"@/lib/forumpay-validation":load("src/lib/forumpay-validation.ts")});
  const service=load("src/lib/forumpay-payouts.ts",{"@/lib/auth":{},"@/lib/api":{},"@/lib/db":{getDb:()=>sql,queryRows:r=>r},
    "@/lib/forumpay":api,"@/lib/forumpay-payout-validation":validation});
  const creator=(await sql`SELECT id FROM users WHERE email='sandbox-creator@example.test' AND display_name='Sandbox Test Creator (synthetic)'`)[0];
  if (!creator)throw new Error("Synthetic creator missing.");
  const id=randomUUID(), address="btc-5592b1fdb13442a9984d98d42e7007ec";
  await sql`SELECT reserve_forumpay_sandbox_payout(${id}::uuid,${creator.id}::uuid,${id}::uuid,800,${address})`;
  const started=await api.forumPayPayoutRequest("StartPayout",{currency:"BTC",address,payer_id:creator.id,
    approx_invoice_amount:"8.00",invoice_currency:"GBP",fee_type:"fixed_in",network_fee_speed:"standard",reference_no:id});
  if (typeof started.id!=="string")throw new Error("Provider did not return a payout ID.");
  await sql`UPDATE forumpay_sandbox_payouts SET provider_id=${started.id},state='pending_confirmation' WHERE id=${id}`;
  const payout=(await sql`SELECT * FROM forumpay_sandbox_payouts WHERE id=${id}`)[0];
  const data=await api.forumPayPayoutRequest("GetPayout",{id:started.id});
  console.log("Sandbox payout response structure",{fields:Object.keys(data),transactionFields:Array.isArray(data.transactions)&&data.transactions[0]?Object.keys(data.transactions[0]):[]});
  if (!validation.validateSandboxPayout(data,payout))throw new Error("Provider payout details failed validation; no confirmation sent.");
  console.log("Sandbox payout prepared and details matched",{payoutId:id,status:data.status});
  if (process.env.FORUMPAY_SANDBOX_PAYOUT_SMOKE_MODE === "confirm") {
    await sql`UPDATE forumpay_sandbox_payouts SET state='confirming' WHERE id=${id}`;
    const confirmed=await api.forumPayPayoutRequest("ConfirmPayout",{id:started.id});
    if (confirmed.confirmed!==true)throw new Error("Provider did not confirm sandbox payout scheduling.");
    console.log("Sandbox creator payout confirmation accepted",{payoutId:id});
    for(let attempt=0;attempt<7;attempt++){
      await service.reconcileSandboxPayout({...payout,state:"confirming"});
      const result=(await sql`SELECT state,txid FROM forumpay_sandbox_payouts WHERE id=${id}`)[0];
      console.log("Sandbox creator payout status",{payoutId:id,state:result.state,hasTransactionId:Boolean(result.txid)});
      if(result.state==="paid")break;
      if(attempt<6)await new Promise(resolve=>setTimeout(resolve,15_000));
    }
  } else {
    await api.forumPayPayoutRequest("CancelPayout",{id:started.id});
    await service.reconcileSandboxPayout(payout);
    const verified=(await sql`SELECT state FROM forumpay_sandbox_payouts WHERE id=${id}`)[0];
    if (verified.state!=="cancelled")throw new Error("Sandbox cancellation not verified.");
    console.log("Sandbox payout prepare/cancel test passed. Synthetic earnings released; no transfer confirmed.");
  }
}
