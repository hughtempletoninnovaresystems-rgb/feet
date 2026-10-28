import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { forumPayPayoutRequest } from "@/lib/forumpay";
import { sandboxCreator, reconcileSandboxPayout } from "@/lib/forumpay-payouts";
import { isSandboxBtcAddress, type SandboxPayout } from "@/lib/forumpay-payout-validation";

export const runtime = "nodejs";
const schema = z.object({ requestKey:z.string().uuid(), amountPence:z.number().int().min(100).max(100000), address:z.string().refine(isSandboxBtcAddress) }).strict();
export async function GET(request:Request) {
  try {
    const auth=await sandboxCreator(request);
    if ("response" in auth) return auth.response;
    const sql=getDb();
    const payouts=queryRows<SandboxPayout>(await sql`SELECT * FROM forumpay_sandbox_payouts WHERE creator_id=${auth.user.id} ORDER BY created_at DESC LIMIT 20`);
    for (const p of payouts.filter(p=>!["creating","paid","cancelled","review"].includes(p.state)).slice(0,3)) {
      try { await reconcileSandboxPayout(p); } catch { /* Reservation remains until verified. */ }
    }
    const balances=queryRows<{earned:string;reserved:string}>(await sql`SELECT
      COALESCE((SELECT sum(amount_pence) FROM forumpay_sandbox_creator_earnings WHERE creator_id=${auth.user.id}),0)::text AS earned,
      COALESCE((SELECT sum(amount_pence) FROM forumpay_sandbox_payouts WHERE creator_id=${auth.user.id} AND state <> 'cancelled'),0)::text AS reserved`)[0];
    const rows=await sql`SELECT id,amount_pence,address,state,crypto_amount,txid FROM forumpay_sandbox_payouts WHERE creator_id=${auth.user.id} ORDER BY created_at DESC LIMIT 20`;
    return Response.json({availablePence:Number(balances.earned)-Number(balances.reserved),earnedPence:Number(balances.earned),payouts:rows},{headers:{"Cache-Control":"private, no-store"}});
  } catch {return jsonError("Sandbox payout wallet unavailable.",503);}
}
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const auth=await sandboxCreator(request);
    if ("response" in auth) return auth.response;
    const parsed=schema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Use a valid test amount and a BTC address from ForumPay's Sandbox Wallet.",400);
    const {requestKey,amountPence,address}=parsed.data;
    const sql=getDb();const id=randomUUID();
    const result=queryRows<{id:string}>(await sql`SELECT reserve_forumpay_sandbox_payout(${id}::uuid,${auth.user.id}::uuid,${requestKey}::uuid,${amountPence},${address}) AS id`)[0];
    if (result.id !== id) return Response.json({payoutId:result.id},{headers:{"Cache-Control":"no-store"}});
    // No automatic StartPayout retry on an ambiguous network failure.
    const provider=await forumPayPayoutRequest("StartPayout",{
      currency:"BTC",address,payer_id:auth.user.id,approx_invoice_amount:(amountPence/100).toFixed(2),
      invoice_currency:"GBP",fee_type:"fixed_in",network_fee_speed:"standard",reference_no:id,
    });
    if (typeof provider.id!=="string" || !z.string().uuid().safeParse(provider.id).success) throw new Error("Invalid payout ID.");
    await sql`UPDATE forumpay_sandbox_payouts SET provider_id=${provider.id},state='pending_confirmation',updated_at=now() WHERE id=${id}`;
    const payout=queryRows<SandboxPayout>(await sql`SELECT * FROM forumpay_sandbox_payouts WHERE id=${id}`)[0];
    await reconcileSandboxPayout(payout);
    return Response.json({payoutId:id},{status:201,headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    if (error instanceof Error && error.message==="Request origin could not be verified.") return jsonError(error.message,403);
    return jsonError("Payout could not be prepared. Check recent requests before retrying; reserved earnings remain held for reconciliation.",503);
  }
}
