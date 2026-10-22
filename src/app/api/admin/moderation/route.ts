import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { createMediaReadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("asset"), id: z.string().uuid(), decision: z.enum(["approve", "reject"]), notes: z.string().trim().max(1000).default("") }),
  z.object({ kind: z.literal("comment"), id: z.string().uuid(), decision: z.enum(["approve", "reject"]), notes: z.string().trim().max(1000).default("") }),
  z.object({ kind: z.literal("report"), id: z.string().uuid(), decision: z.enum(["actioned", "dismissed"]), accountAction: z.enum(["none", "restrict", "suspend"]).default("none"), notes: z.string().trim().max(1000).default("") }),
]);

async function authorize(request?: Request) {
  const user = await getSessionUser();
  if (!user) return { response: jsonError("Sign in to access moderation.", 401) } as const;
  if (user.role !== "admin" || user.status !== "active" || !user.email_verified_at) return { response: jsonError("Administrator access is required.", 403) } as const;
  if (request && !(await enforceRateLimit(request, `moderation:${user.id}`, 120, 900))) return { response: rateLimitResponse() } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  try {
    const sql = getDb();
    const assets = queryRows<{
      id: string; owner_user_id: string; display_name: string; media_type: string; mime_type: string;
      size_bytes: number; created_at: string; storage_key: string; media_title: string;
    }>(await sql`
      SELECT a.id, a.owner_user_id, u.display_name, a.media_type, a.mime_type, a.size_bytes, a.created_at,
             a.storage_key, m.title AS media_title
      FROM media_assets a JOIN users u ON u.id = a.owner_user_id
      LEFT JOIN creator_media_assets x ON x.media_asset_id = a.id
      LEFT JOIN creator_media m ON m.id = x.creator_media_id
      WHERE a.moderation_status = 'pending' AND a.upload_status = 'uploaded' AND a.deleted_at IS NULL
      ORDER BY a.created_at ASC LIMIT 100`);
    const comments = queryRows<{ id: string; display_name: string; target_name: string; body: string; created_at: string }>(await sql`
      SELECT c.id, author.display_name, target.display_name AS target_name, c.body, c.created_at
      FROM profile_comments c JOIN users author ON author.id = c.author_user_id JOIN users target ON target.id = c.target_user_id
      WHERE c.status = 'pending' ORDER BY c.created_at ASC LIMIT 100`);
    const reports = queryRows<{
      id: string; reporter_name: string | null; reported_name: string | null; target_kind: string;
      target_id: string | null; reason: string; details: string; target_context: string | null; created_at: string;
    }>(await sql`
      SELECT r.id, reporter.display_name AS reporter_name, reported.display_name AS reported_name,
             r.target_kind, r.target_id, r.reason, r.details, msg.body AS target_context, r.created_at
      FROM reports r LEFT JOIN users reporter ON reporter.id = r.reporter_user_id
      LEFT JOIN users reported ON reported.id = r.reported_user_id
      LEFT JOIN messages msg ON r.target_kind = 'message' AND msg.id = r.target_id
      WHERE r.status IN ('open', 'reviewing') ORDER BY r.created_at ASC LIMIT 100`);
    const media = await Promise.all(assets.map(async ({ storage_key, ...asset }) => ({
      ...asset,
      size_bytes: Number(asset.size_bytes),
      reviewUrl: await createMediaReadUrl(storage_key).catch(() => null),
    })));
    return Response.json({ media, comments, reports }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return jsonError("The moderation queue is temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const parsed = decisionSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Check the moderation decision and try again.", 400);
    const sql = getDb();
    const decision = parsed.data;

    if (decision.kind === "asset") {
      const status = decision.decision === "approve" ? "approved" : "rejected";
      const rows = queryRows<{ id: string; media_id: string | null }>(await sql`
        WITH reviewed AS (
          UPDATE media_assets a SET moderation_status = ${status}, moderated_by = ${auth.user.id}, moderated_at = now(), moderation_notes = ${decision.notes}
          WHERE a.id = ${decision.id} AND a.moderation_status = 'pending' AND a.upload_status = 'uploaded'
          RETURNING a.id
        ), affected_media AS (
          SELECT x.creator_media_id AS media_id FROM creator_media_assets x JOIN reviewed r ON r.id = x.media_asset_id LIMIT 1
        ), audit AS (
          INSERT INTO security_audit_events(actor_user_id, event_type, subject_user_id, metadata)
          SELECT ${auth.user.id}, 'moderation_asset_' || ${status}, a.owner_user_id,
                 jsonb_build_object('asset_id', r.id, 'notes', ${decision.notes})
          FROM reviewed r JOIN media_assets a ON a.id = r.id RETURNING id
        )
        SELECT r.id, m.media_id FROM reviewed r LEFT JOIN affected_media m ON true`);
      if (!rows[0]) return jsonError("This file is no longer awaiting review.", 409);
      if (decision.decision === "reject" && rows[0].media_id) {
        await sql`UPDATE creator_media SET status = 'hidden', updated_at = now() WHERE id = ${rows[0].media_id} AND status = 'published'`;
      }
    } else if (decision.kind === "comment") {
      const status = decision.decision === "approve" ? "visible" : "removed";
      const rows = queryRows<{ id: string }>(await sql`
        WITH reviewed AS (
          UPDATE profile_comments SET status = ${status}
          WHERE id = ${decision.id} AND status = 'pending' RETURNING id, author_user_id
        ), audit AS (
          INSERT INTO security_audit_events(actor_user_id, event_type, subject_user_id, metadata)
          SELECT ${auth.user.id}, 'moderation_comment_' || ${status}, author_user_id,
                 jsonb_build_object('comment_id', id, 'notes', ${decision.notes}) FROM reviewed RETURNING id
        ) SELECT id FROM reviewed`);
      if (!rows[0]) return jsonError("This comment is no longer awaiting review.", 409);
    } else {
      const rows = queryRows<{ id: string; reported_user_id: string | null }>(await sql`
        WITH reviewed AS (
          UPDATE reports SET status = ${decision.decision}, reviewed_at = now(), reviewed_by = ${auth.user.id}, resolution = ${decision.notes}
          WHERE id = ${decision.id} AND status IN ('open', 'reviewing') RETURNING id, reported_user_id
        ), restricted AS (
          UPDATE users SET status = ${decision.accountAction === "suspend" ? "suspended" : "restricted"}, updated_at = now()
          WHERE id IN (SELECT reported_user_id FROM reviewed WHERE reported_user_id IS NOT NULL)
            AND ${decision.decision === "actioned" && decision.accountAction !== "none"}
          RETURNING id
        ), audit AS (
          INSERT INTO security_audit_events(actor_user_id, event_type, subject_user_id, metadata)
          SELECT ${auth.user.id}, 'moderation_report_' || ${decision.decision}, r.reported_user_id,
                 jsonb_build_object('report_id', r.id, 'account_action', ${decision.accountAction}, 'notes', ${decision.notes})
          FROM reviewed r RETURNING id
        ) SELECT id FROM reviewed`);
      if (!rows[0]) return jsonError("This report is no longer awaiting review.", 409);
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Check the moderation decision and try again.", 400);
    return jsonError("The moderation decision could not be saved.", 503);
  }
}
