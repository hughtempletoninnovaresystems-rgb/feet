import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export type SegpayWebhookCredentials = { username: string; password: string };

export type SegpayTransactionPostback = {
  transactionType: string;
  action: string;
  stage: string;
  approved: boolean;
  purchaseId: string;
  transactionId: string;
  relatedTransactionId: string | null;
  amount: string;
  currency: string;
  packageId: string | null;
  reference1: string | null;
};

export function getSegpayWebhookCredentials(): SegpayWebhookCredentials | null {
  if (process.env.PAYMENT_PROVIDER?.trim().toLowerCase() !== "segpay") return null;
  const username = process.env.SEGPAY_POSTBACK_USERNAME?.trim();
  const password = process.env.SEGPAY_POSTBACK_PASSWORD;
  return username && password ? { username, password } : null;
}

export function getSegpayPaymentPageUrl(): string | null {
  if (process.env.PAYMENT_PROVIDER?.trim().toLowerCase() !== "segpay") return null;
  const value = process.env.SEGPAY_PAYMENT_PAGE_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.endsWith(".segpay.com") || url.port || url.pathname !== "/billing/poset.cgi" || !url.searchParams.get("x-eticketid")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function constantTimeEquals(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function verifySegpayBasicAuthorization(authorization: string | null, credentials: SegpayWebhookCredentials) {
  if (!authorization || !authorization.startsWith("Basic ")) return false;
  const encoded = authorization.slice(6).trim();
  if (!encoded || encoded.length > 2048) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const decodedBytes = Buffer.from(encoded, "base64");
  if (decodedBytes.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) return false;
  const decoded = decodedBytes.toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 1) return false;
  const actualUser = decoded.slice(0, separator);
  const actualPassword = decoded.slice(separator + 1);
  return constantTimeEquals(actualUser, credentials.username) && constantTimeEquals(actualPassword, credentials.password);
}

function field(fields: Map<string, string>, ...names: string[]) {
  for (const name of names) {
    const value = fields.get(name.toLowerCase())?.trim();
    if (value) return value;
  }
  return null;
}

function requiredField(fields: Map<string, string>, label: string, ...names: string[]) {
  const value = field(fields, ...names);
  if (!value || value.length > 200) throw new Error(`Segpay postback is missing a valid ${label}.`);
  return value;
}

export function parseSegpayTransactionPostback(fields: Map<string, string>): SegpayTransactionPostback {
  const transactionType = requiredField(fields, "transaction type", "trantype");
  const action = requiredField(fields, "action", "action");
  const stage = requiredField(fields, "stage", "stage");
  const purchaseId = requiredField(fields, "purchase ID", "purchaseid");
  const transactionId = requiredField(fields, "transaction ID", "tranid");
  const rawAmount = requiredField(fields, "amount", "price");
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(rawAmount)) throw new Error("Segpay postback amount is invalid.");
  const rawApproved = requiredField(fields, "approval status", "approved").toLowerCase();
  if (!["yes", "no", "true", "false", "1", "0", "approved", "declined"].includes(rawApproved)) throw new Error("Segpay postback approval status is invalid.");
  const amount = Number(rawAmount).toFixed(2);
  if (!Number.isFinite(Number(amount))) throw new Error("Segpay postback amount is invalid.");
  const currency = requiredField(fields, "currency", "currencycode").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Segpay postback currency is invalid.");
  return {
    transactionType,
    action,
    stage,
    approved: ["yes", "true", "1", "approved"].includes(rawApproved),
    purchaseId,
    transactionId,
    relatedTransactionId: field(fields, "relatedtranid"),
    amount,
    currency,
    packageId: field(fields, "eticketid"),
    reference1: field(fields, "ref1"),
  };
}

export function segpayPostbackEventId(postback: SegpayTransactionPostback) {
  const canonical = [postback.transactionId, postback.purchaseId, postback.transactionType, postback.action, postback.stage, postback.approved ? "1" : "0", postback.amount, postback.currency, postback.relatedTransactionId ?? ""].join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}
