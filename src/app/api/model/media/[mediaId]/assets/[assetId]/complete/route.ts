import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { deleteMediaObject, inspectMediaObject } from "@/lib/storage";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ mediaId: string; assetId: string }> }) {
  try {
    assertSameOrigin(request);
    if (!productionMarketplaceEnabled()) return jsonError("Creator uploads are unavailable until the marketplace launch gates are complete.", 503);
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in to complete this upload.", 401);
    if (user.role !== "model" || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) return jsonError("An active, age-verified creator account is required.", 403);
    if (!(await enforceRateLimit(request, `creator-upload-complete:${user.id}`, 30, 3600))) return rateLimitResponse();
    const { mediaId, assetId } = await params;
    if (![mediaId, assetId].every((id) => /^[0-9a-f-]{36}$/i.test(id))) return jsonError("Upload not found.", 404);
    const sql = getDb();
    const rows = queryRows<{ storage_key: string; size_bytes: number; mime_type: string }>(await sql`
      SELECT a.storage_key, a.size_bytes, a.mime_type
      FROM media_assets a JOIN creator_media_assets x ON x.media_asset_id = a.id
      JOIN creator_media m ON m.id = x.creator_media_id
      WHERE a.id = ${assetId} AND x.creator_media_id = ${mediaId} AND a.owner_user_id = ${user.id}
        AND m.model_user_id = ${user.id} AND a.upload_status = 'awaiting_upload'
      LIMIT 1`);
    const asset = rows[0];
    if (!asset) return jsonError("Upload not found or already completed.", 404);
    let object: Awaited<ReturnType<typeof inspectMediaObject>>;
    try { object = await inspectMediaObject(asset.storage_key); }
    catch { return jsonError("The file is not present in private storage yet.", 409); }
    if (object.sizeBytes !== Number(asset.size_bytes) || object.mimeType !== asset.mime_type) {
      await deleteMediaObject(asset.storage_key).catch(() => undefined);
      await sql`UPDATE media_assets SET upload_status = 'failed', moderation_status = 'rejected', moderation_notes = 'Uploaded object did not match its declared size or type.' WHERE id = ${assetId} AND owner_user_id = ${user.id}`;
      return jsonError("The uploaded file did not match its declared size or type.", 400);
    }
    await sql`UPDATE media_assets SET upload_status = 'uploaded' WHERE id = ${assetId} AND owner_user_id = ${user.id} AND upload_status = 'awaiting_upload'`;
    return Response.json({ ok: true, moderationStatus: "pending" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    return jsonError("The uploaded file could not be confirmed.", 503);
  }
}
