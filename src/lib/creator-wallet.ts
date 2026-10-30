// Creator wallet summary in integer pence. Pure functions only: no database, provider or environment access.
// Phase A reads the sandbox earnings/payout tables; the same shape can later be backed by the real ledger.

export const PAYOUT_STATES = [
  "creating",
  "pending_confirmation",
  "confirming",
  "scheduled",
  "paid",
  "cancelling",
  "cancelled",
  "review",
] as const;
export type PayoutState = (typeof PAYOUT_STATES)[number];

export type WalletSummary = {
  /** All earnings credited to the creator. */
  earnedPence: number;
  /** Payouts confirmed in the blockchain with a transaction ID. */
  paidPence: number;
  /** Held for payouts that are not paid or cancelled yet (including ambiguous outcomes). */
  reservedPence: number;
  /** Earned minus paid minus reserved. Never negative. */
  availablePence: number;
};

export type PayoutStatusKind = "progress" | "action" | "attention" | "done" | "closed";
export type PayoutStatus = { label: string; detail: string; kind: PayoutStatusKind; holdsFunds: boolean };

const STATUS: Record<PayoutState, PayoutStatus> = {
  creating: { label: "Being created", detail: "The request is being sent to the provider. Funds are held. Do not create a replacement.", kind: "progress", holdsFunds: true },
  pending_confirmation: { label: "Awaiting your confirmation", detail: "Review the crypto amount, then confirm or cancel. Funds are held until you decide.", kind: "action", holdsFunds: true },
  confirming: { label: "Confirming", detail: "Confirmation was sent. Funds stay held until the provider reports the outcome.", kind: "progress", holdsFunds: true },
  scheduled: { label: "Scheduled", detail: "Accepted by the provider but not confirmed in the blockchain yet. Funds stay held.", kind: "progress", holdsFunds: true },
  paid: { label: "Paid", detail: "Confirmed in the blockchain.", kind: "done", holdsFunds: false },
  cancelling: { label: "Cancelling", detail: "Cancellation was requested. Funds stay held until the provider confirms it.", kind: "progress", holdsFunds: true },
  cancelled: { label: "Cancelled", detail: "Cancelled. The held funds were released.", kind: "closed", holdsFunds: false },
  review: { label: "Needs review", detail: "The outcome could not be verified. Funds stay held. Do not create a replacement.", kind: "attention", holdsFunds: true },
};

const UNKNOWN: PayoutStatus = { label: "Unknown", detail: "Unrecognised status. Funds stay held until it is reviewed.", kind: "attention", holdsFunds: true };

export function describePayoutState(state: string): PayoutStatus {
  return (STATUS as Record<string, PayoutStatus>)[state] ?? UNKNOWN;
}

function wholePence(value: unknown) {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/**
 * earnedPence: sum of creator earnings. totalsByState: sum of payout pence per payout state.
 * Unknown states are treated as holding funds, so a new state can never release money by accident.
 */
export function summarizeWallet(earnedPence: unknown, totalsByState: Record<string, unknown>): WalletSummary {
  const earned = wholePence(earnedPence);
  let paid = 0;
  let reserved = 0;
  for (const [state, total] of Object.entries(totalsByState)) {
    const pence = wholePence(total);
    if (state === "paid") paid += pence;
    else if (describePayoutState(state).holdsFunds) reserved += pence;
  }
  return { earnedPence: earned, paidPence: paid, reservedPence: reserved, availablePence: Math.max(0, earned - paid - reserved) };
}

export function formatPence(pence: number) {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(pence));
  return `${sign}£${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
