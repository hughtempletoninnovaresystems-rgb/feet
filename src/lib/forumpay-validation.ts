export const sandboxPackages = [
  { id: "test-100", tokens: 100, pence: 1000 },
] as const;

export function amountInPence(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function verifiedPaymentMatches(data: Record<string, unknown>, order: { id: string; amount_pence: number }) {
  return data.confirmed === true && data.cancelled !== true &&
    data.reference_no === order.id && data.invoice_currency === "GBP" &&
    amountInPence(data.invoice_amount) === order.amount_pence;
}

export function sandboxPaymentUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing ForumPay checkout URL.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "sandbox.widget.forumpay.com" || url.port || url.username || url.password) {
    throw new Error("Invalid ForumPay sandbox checkout URL.");
  }
  return url.href;
}
