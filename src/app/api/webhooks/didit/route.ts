import { createHash } from "node:crypto";
import { getDb, queryRows } from "@/lib/db";
import {
  DiditWebhookInputError,
  type DiditWebhook,
  diditWebhookEventKey,
  diditWebhookLocalStatus,
  readDiditWebhookBody,
  verifyDiditWebhook,
} from "@/lib/didit-webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReceiptResult = { inserted_count: number; updated_count: number };

export async function POST(request: Request) {
  const secret = process.env.DIDIT_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ error: "Webhook endpoint is not configured." }, { status: 503 });
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Content-Type must be application/json." }, { status: 400 });
  }

  let rawBody: Buffer | null = null;
  let event: DiditWebhook;
  try {
    rawBody = await readDiditWebhookBody(request);
    event = verifyDiditWebhook(rawBody, request.headers, secret);
  } catch (error) {
    if (error instanceof DiditWebhookInputError) {
      // Keep sensitive/attacker-controlled payload contents out of application logs.
      if (error.status === 401) {
        console.warn("Didit webhook rejected", {
          reason: error.message,
          body_bytes: rawBody?.byteLength,
          body_sha256: rawBody ? createHash("sha256").update(rawBody).digest("hex") : undefined,
        });
      }
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Could not read webhook." }, { status: 400 });
  }

  try {
    const eventKey = diditWebhookEventKey(event);
    const eventType = event.webhook_type;
    const sessionId = event.session_id ?? null;
    const localStatus = diditWebhookLocalStatus(event);
    const db = getDb();
    const rows = queryRows<ReceiptResult>(await db`
      WITH inserted_event AS (
        INSERT INTO didit_webhook_events (event_id, webhook_type)
        VALUES (${eventKey}, ${eventType})
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      ), updated_session AS (
        UPDATE age_verification_sessions AS verification
        SET status = ${localStatus},
            completed_at = CASE WHEN ${localStatus} = 'complete' THEN COALESCE(verification.completed_at, now()) ELSE verification.completed_at END,
            updated_at = now()
        FROM inserted_event
        WHERE ${sessionId}::text IS NOT NULL
          AND ${localStatus}::text IS NOT NULL
          AND verification.provider = 'didit'
          AND verification.provider_session_id = ${sessionId}
          AND verification.status IN ('creating', 'pending', 'in_progress')
        RETURNING verification.user_id, verification.status
      ), updated_user AS (
        UPDATE users AS account
        SET age_verified_at = COALESCE(account.age_verified_at, now()),
            status = CASE WHEN account.status = 'pending' THEN 'active' ELSE account.status END,
            updated_at = now()
        FROM updated_session
        WHERE updated_session.status = 'complete'
          AND account.id = updated_session.user_id
          AND account.email_verified_at IS NOT NULL
          AND account.status IN ('pending', 'active')
        RETURNING account.id
      ), audit_event AS (
        INSERT INTO security_audit_events (actor_user_id, subject_user_id, event_type)
        SELECT id, id, 'age_verified_didit' FROM updated_user
        RETURNING id
      )
      SELECT
        (SELECT count(*)::int FROM inserted_event) AS inserted_count,
        (SELECT count(*)::int FROM updated_session) AS updated_count
    `);

    const result = rows[0];
    if (result?.inserted_count === undefined) throw new Error("Didit webhook persistence failed.");
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Didit webhook processing failed", {
      event_type: event.webhook_type,
      body_bytes: rawBody?.byteLength,
      body_sha256: rawBody ? createHash("sha256").update(rawBody).digest("hex") : undefined,
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "Could not process webhook." }, { status: 500 });
  }
}
