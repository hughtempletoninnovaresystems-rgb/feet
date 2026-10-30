import { amountInPence } from "@/lib/forumpay-validation";

export function isSandboxBtcAddress(value: string) {
  return /^btc-[a-f0-9]{32}$/.test(value);
}
export type SandboxPayout = {
  id: string; creator_id: string; provider_id: string | null;
  amount_pence: number; address: string; state: string;
};
export function validateSandboxPayout(data: Record<string, unknown>, payout: SandboxPayout) {
  if (data.id !== payout.provider_id || data.fee_type !== "fixed_in" || !Array.isArray(data.transactions) || data.transactions.length !== 1) return null;
  const tx = data.transactions[0];
  if (!tx || typeof tx !== "object" || tx.currency !== "BTC" || tx.address !== payout.address ||
      tx.payer_id !== payout.creator_id || tx.reference_no !== payout.id || tx.invoice_currency !== "GBP" ||
      amountInPence(tx.approx_invoice_amount) !== payout.amount_pence || typeof tx.amount !== "string" ||
      !/^\d{1,10}(?:\.\d{1,8})?$/.test(tx.amount) || Number(tx.amount) <= 0) return null;
  return tx as { amount: string; status: string; txid?: string };
}
