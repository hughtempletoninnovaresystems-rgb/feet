import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { createMediaUploadUrl, isAllowedUpload } from "@/lib/storage";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

export const runtime = "nodejs";
const schema = z.object({ mimeType: z.string().max(100), sizeBytes: z.number().int().positive().max(100 * 1024 * 1024) });

export async function POST(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  try {
    assertSameOrigin(request);
    if (!productionMarketplaceEnabled()) return jsonError("Creator uploads are unavailable until the marketplace launch gates are complete.", 503);
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in to upload creator media.", 401);
    if (user.role !== "model" || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) return jsonError("An active, age-verified creator account is required.", 403);
    if (!(await enforceRateLimit(request, `creator-upload:${user.id}`, 20, 3600))) return rateLimitResponse();
    const { mediaId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return jsonError("Media not found.", 404);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success || !isAllowedUpload(parsed.data.mimeType, parsed.data.sizeBytes)) return jsonError("Use a supported image or video file up to 100 MB.", 400);
    const mimeType = parsed.data.mimeType;
    const mediaType = mimeType.startsWith("video/") ? "video" : "photo_set";
    const sql = getDb();
    const owned = queryRows<{ id: string }>(await sql`
      SELECT id FROM creator_media WHERE id = ${mediaId} AND model_user_id = ${user.id}
        AND status IN ('draft', 'hidden') AND media_type = ${mediaType} LIMIT 1`)[0];
    if (!owned) return jsonError("This file does not match an editable media item.", 404);
    const pending = queryRows<{ bytes: string | number }>(await sql`
      SELECT COALESCE(sum(size_bytes), 0)::text AS bytes FROM media_assets
      WHERE owner_user_id = ${user.id} AND deleted_at IS NULL
        AND upload_status IN ('awaiting_upload', 'uploaded') AND moderation_status = 'pending'`)[0];
    if (Number(pending?.bytes ?? 0) + parsed.data.sizeBytes > 500 * 1024 * 1024) return jsonError("Finish moderation or remove pending uploads before adding more files.", 413);

    const assetId = randomUUID();
    const key = `creator-media/${user.id}/${assetId}`;
    const { url } = await createMediaUploadUrl({ key, mimeType, sizeBytes: parsed.data.sizeBytes });
    await sql`WITH created AS (
                INSERT INTO media_assets(id, owner_user_id, storage_key, media_type, mime_type, size_bytes, moderation_status, upload_status)
                VALUES (${assetId}, ${user.id}, ${key}, ${mimeType.startsWith("video/") ? "video" : "image"}, ${mimeType}, ${parsed.data.sizeBytes}, 'pending', 'awaiting_upload')
                RETURNING id
              )
              INSERT INTO creator_media_assets(creator_media_id, media_asset_id, sort_order)
              SELECT ${mediaId}, id, COALESCE((SELECT max(sort_order) + 1 FROM creator_media_assets WHERE creator_media_id = ${mediaId}), 0)
              FROM created`;
    return Response.json({ assetId, uploadUrl: url, method: "PUT", headers: { "Content-Type": mimeType, "Cache-Control": "private, no-store", "x-amz-server-side-encryption": "AES256" }, expiresInSeconds: 90 }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Check the upload details and try again.", 400);
    return jsonError("Private media upload could not be started. Check the S3 configuration.", 503);
  }
}
