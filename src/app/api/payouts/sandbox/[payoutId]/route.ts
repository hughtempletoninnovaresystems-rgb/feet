import { z } from "zod";
import { assertSameOrigin } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { forumPayPayoutRequest } from "@/lib/forumpay";
import { sandboxCreator, reconcileSandboxPayout } from "@/lib/forumpay-payouts";
import { validateSandboxPayout, type SandboxPayout } from "@/lib/forumpay-payout-validation";

export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{payoutId:string}>}) {
  try {
    assertSameOrigin(request);
    const auth=await sandboxCreator(request);
    if ("response" in auth) return auth.response;
    const {payoutId}=await context.params;
    const action=z.object({action:z.enum(["confirm","cancel"])}).strict().safeParse(await readJson(request));
    if (!z.string().uuid().safeParse(payoutId).success || !action.success) return jsonError("Invalid payout request.",400);
    const sql=getDb();
    const payout=queryRows<SandboxPayout>(await sql`SELECT * FROM forumpay_sandbox_payouts WHERE id=${payoutId} AND creator_id=${auth.user.id}`)[0];
    if (!payout || !payout.provider_id) return jsonError("Prepared payout not found.",404);
    const provider=await forumPayPayoutRequest("GetPayout",{id:payout.provider_id});
    if (!validateSandboxPayout(provider,payout)) return jsonError("Payout details do not match the request.",409);
    if (provider.status!=="pending confirmation") {
      await reconcileSandboxPayout(payout);
      return jsonError("Payout is no longer awaiting confirmation. Refresh its status.",409);
    }
    const state=action.data.action==="confirm"?"confirming":"cancelling";
    const claimed=queryRows(await sql`UPDATE forumpay_sandbox_payouts SET state=${state},updated_at=now()
      WHERE id=${payoutId} AND creator_id=${auth.user.id} AND state='pending_confirmation' RETURNING id`);
    if (!claimed.length) return jsonError("This payout action is already processing.",409);
    // Keep reservation on timeout; GetPayout determines the eventual outcome.
    await forumPayPayoutRequest(action.data.action==="confirm"?"ConfirmPayout":"CancelPayout",{id:payout.provider_id});
    await reconcileSandboxPayout({...payout,state});
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    if (error instanceof Error && error.message==="Request origin could not be verified.") return jsonError(error.message,403);
    return jsonError("Payout action needs reconciliation. Do not create a replacement payout.",503);
  }
}
