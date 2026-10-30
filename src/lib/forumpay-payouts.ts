import "server-only";
import { getSessionUser, enforceRateLimit } from "@/lib/auth";
import { jsonError, rateLimitResponse } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { forumPayPayoutRequest, forumPaySandboxPayoutsEnabled } from "@/lib/forumpay";
import { validateSandboxPayout, type SandboxPayout } from "@/lib/forumpay-payout-validation";

export async function sandboxCreator(request: Request) {
  if (!forumPaySandboxPayoutsEnabled()) return { response: jsonError("Sandbox payouts unavailable.",503) } as const;
  const user = await getSessionUser();
  if (!user) return { response: jsonError("Sign in to test payouts.",401) } as const;
  if (user.role !== "model" || user.status !== "active" || !user.age_verified_at || !user.email_verified_at) {
    return { response: jsonError("An eligible creator account is required.",403) } as const;
  }
  if (!(await enforceRateLimit(request,`sandbox-payout:${user.id}`,30,60))) return {response:rateLimitResponse()} as const;
  return {user} as const;
}

export async function reconcileSandboxPayout(payout: SandboxPayout) {
  if (!payout.provider_id || payout.state === "paid" || payout.state === "cancelled") return;
  const data = await forumPayPayoutRequest("GetPayout",{id:payout.provider_id});
  const tx = validateSandboxPayout(data,payout);
  const sql = getDb();
  if (!tx) {
    await sql`UPDATE forumpay_sandbox_payouts SET state='review',updated_at=now() WHERE id=${payout.id} AND state NOT IN ('paid','cancelled')`;
    throw new Error("Payout details require review.");
  }
  const cancelled = data.status === "cancelled" && tx.status === "cancelled";
  const paid = tx.status === "confirmed in blockchain" && typeof tx.txid === "string" && tx.txid.length > 0;
  const pending = data.status === "pending confirmation";
  const state = cancelled ? "cancelled" : paid ? "paid" : pending ? (["confirming","cancelling"].includes(payout.state) ? payout.state : "pending_confirmation") : "scheduled";
  await sql`UPDATE forumpay_sandbox_payouts SET state=${state},crypto_amount=${tx.amount},txid=${tx.txid ?? null},updated_at=now()
    WHERE id=${payout.id} AND state NOT IN ('paid','cancelled')`;
  return {state,cryptoAmount:tx.amount};
}
