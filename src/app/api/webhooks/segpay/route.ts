import { getDb, queryRows } from "@/lib/db";
import {
  getSegpayWebhookCredentials,
  parseSegpayTransactionPostback,
  segpayPostbackEventId,
  type SegpayTransactionPostback,
  verifySegpayBasicAuthorization,
} from "@/lib/segpay";

export const runtime = "nodejs";

const MAX_POSTBACK_BYTES = 16 * 1024;

function response(status: number, body = "") {
  return new Response(body, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

async function readBoundedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_POSTBACK_BYTES) throw new Error("Postback body is too large.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_POSTBACK_BYTES) {
      await reader.cancel();
      throw new Error("Postback body is too large.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function handle(request: Request) {
  if (request.method !== "GET" && request.method !== "POST") return response(405, "Method not allowed");
  const credentials = getSegpayWebhookCredentials();
  if (!credentials) return response(503, "Postback unavailable");
  if (!verifySegpayBasicAuthorization(request.headers.get("authorization"), credentials)) {
    return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store", "WWW-Authenticate": 'Basic realm="Segpay postback"' } });
  }
  if (request.url.length > MAX_POSTBACK_BYTES) return response(413, "Postback body is too large");

  let fields: Map<string, string>;
  try {
    const params = request.method === "GET"
      ? new URL(request.url).searchParams
      : new URLSearchParams(await readBoundedBody(request));
    fields = new Map();
    for (const [key, value] of params) {
      const normalizedKey = key.trim().toLowerCase();
      if (!normalizedKey || normalizedKey.length > 80 || value.length > 2000) throw new Error("Postback fields are invalid.");
      fields.set(normalizedKey, value);
    }
  } catch (error) {
    return response(error instanceof Error && error.message === "Postback body is too large." ? 413 : 400, "Invalid postback");
  }

  let postback: SegpayTransactionPostback;
  try {
    postback = parseSegpayTransactionPostback(fields);
  } catch {
    return response(400, "Invalid postback");
  }

  const eventId = segpayPostbackEventId(postback);
  const eventType = `${postback.transactionType}.${postback.action}.${postback.stage}`.slice(0, 120);
  try {
    const sql = getDb();
    await sql`
      INSERT INTO payment_provider_events(provider, event_id, event_type)
      VALUES ('segpay', ${eventId}, ${eventType})
      ON CONFLICT (provider, event_id) DO NOTHING
    `;

    const alreadyStored = queryRows<{ event_id: string }>(await sql`
      SELECT event_id FROM segpay_postback_events
      WHERE provider = 'segpay' AND event_id = ${eventId}
      LIMIT 1
    `)[0];
    if (alreadyStored) {
      await sql`
        UPDATE payment_provider_events
        SET processed_at = COALESCE(processed_at, now()), processing_error = NULL
        WHERE provider = 'segpay' AND event_id = ${eventId}
      `;
      return response(204);
    }

    await sql`
      INSERT INTO segpay_postback_events(
        provider, event_id, transaction_id, purchase_id, related_transaction_id,
        transaction_type, action, stage, approved, amount, currency, package_id, reference_1
      ) VALUES (
        'segpay', ${eventId}, ${postback.transactionId}, ${postback.purchaseId}, ${postback.relatedTransactionId},
        ${postback.transactionType}, ${postback.action}, ${postback.stage}, ${postback.approved}, ${postback.amount},
        ${postback.currency}, ${postback.packageId}, ${postback.reference1}
      )
      ON CONFLICT (provider, event_id) DO NOTHING
    `;
    await sql`
      UPDATE payment_provider_events
      SET processed_at = now(), processing_error = NULL
      WHERE provider = 'segpay' AND event_id = ${eventId}
    `;
    return response(204);
  } catch {
    return response(503, "Postback persistence unavailable");
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
