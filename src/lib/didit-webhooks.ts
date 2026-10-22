import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MAX_WEBHOOK_BYTES = 1_048_576;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DiditWebhook = Record<string, unknown> & {
  event_id?: string;
  webhook_type: string;
  timestamp: number;
  session_id?: string;
  status?: string;
};

export class DiditWebhookInputError extends Error {
  constructor(message: string, readonly status: 400 | 401 | 413) {
    super(message);
  }
}

export async function readDiditWebhookBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new DiditWebhookInputError("Webhook body is required.", 400);

  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_WEBHOOK_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new DiditWebhookInputError("Webhook body is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}

function compareCodePoints(left: string, right: string) {
  const a = Array.from(left, (char) => char.codePointAt(0) ?? 0);
  const b = Array.from(right, (char) => char.codePointAt(0) ?? 0);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Unsupported JSON value.");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const object = value as Record<string, unknown>;
  const fields = Object.keys(object)
    .sort(compareCodePoints)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`);
  return `{${fields.join(",")}}`;
}

function verifyHmac(secret: string, data: Buffer | string, signature: string | null) {
  if (!signature || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(data).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function verifyDiditWebhook(rawBody: Buffer, headers: Headers, secret: string, now = Date.now()): DiditWebhook {
  let bodyText: string;
  let parsed: unknown;
  try {
    bodyText = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
    parsed = JSON.parse(bodyText);
  } catch {
    throw new DiditWebhookInputError("Webhook body is not valid JSON.", 400);
  }

  if (!isRecord(parsed)) throw new DiditWebhookInputError("Webhook body is invalid.", 400);

  const signatureV2 = headers.get("x-signature-v2");
  const signatureRaw = headers.get("x-signature");
  let signatureValid = false;
  try {
    if (signatureV2) signatureValid = verifyHmac(secret, canonicalJson(parsed), signatureV2);
    if (!signatureValid && signatureRaw) signatureValid = verifyHmac(secret, rawBody, signatureRaw);
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) throw new DiditWebhookInputError("Webhook signature is invalid.", 401);

  // timestamp is covered by both full-body signatures. X-Timestamp is not signed.
  const timestamp = parsed.timestamp;
  if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > 300) {
    throw new DiditWebhookInputError("Webhook timestamp is outside the allowed window.", 401);
  }
  if (typeof parsed.webhook_type !== "string" || !/^[a-z][a-z\d_.]{1,99}$/i.test(parsed.webhook_type)) {
    throw new DiditWebhookInputError("Webhook event type is invalid.", 400);
  }
  if (parsed.event_id !== undefined && (typeof parsed.event_id !== "string" || parsed.event_id.length < 1 || parsed.event_id.length > 128)) {
    throw new DiditWebhookInputError("Webhook event ID is invalid.", 400);
  }
  if (parsed.session_id !== undefined && (typeof parsed.session_id !== "string" || !UUID.test(parsed.session_id))) {
    throw new DiditWebhookInputError("Webhook session ID is invalid.", 400);
  }
  if (parsed.status !== undefined && typeof parsed.status !== "string") {
    throw new DiditWebhookInputError("Webhook status is invalid.", 400);
  }
  return parsed as DiditWebhook;
}

export function diditWebhookEventKey(event: DiditWebhook) {
  if (event.event_id) return event.event_id;

  const resourceId = event.session_id ?? event.vendor_user_id ?? event.vendor_business_id ?? event.transaction_id ?? event.txn_id;
  if ((typeof resourceId !== "string" && typeof resourceId !== "number") || typeof event.status !== "string") {
    throw new DiditWebhookInputError("Webhook event ID is missing.", 400);
  }
  const fallback = `${String(resourceId)}:${event.status}:${event.webhook_type}`;
  return `fallback:${createHash("sha256").update(fallback).digest("hex")}`;
}

export function diditWebhookLocalStatus(event: DiditWebhook) {
  if (event.webhook_type !== "status.updated" || event.session_kind === "business" || !event.session_id) return null;
  switch (event.status) {
    case "Approved": {
      const decision = event.decision;
      if (!isRecord(decision) || decision.session_id !== event.session_id || decision.status !== "Approved") return null;
      const checks = decision.liveness_checks;
      const hasAgeEvidence = Array.isArray(checks) && checks.some((check) =>
        isRecord(check) && typeof check.age_estimation === "number" && Number.isFinite(check.age_estimation) && check.age_estimation >= 0,
      );
      return hasAgeEvidence ? "complete" as const : null;
    }
    case "Declined": return "failed" as const;
    case "In Review": return "pending" as const;
    case "In Progress": return "in_progress" as const;
    case "Resubmitted": return "in_progress" as const;
    case "Abandoned": return "cancelled" as const;
    case "Expired":
    case "KYC Expired":
    case "Kyc Expired": return "expired" as const;
    default: return null;
  }
}
