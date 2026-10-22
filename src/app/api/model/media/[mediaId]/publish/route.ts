import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  try {
    assertSameOrigin(request);
    if (!productionMarketplaceEnabled()) return jsonError("Creator publishing is unavailable until the marketplace launch gates are complete.", 503);
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in to publish creator media.", 401);
    if (user.role !== "model" || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) return jsonError("An active, age-verified creator account is required.", 403);
    if (!(await enforceRateLimit(request, `creator-publish:${user.id}`, 30, 3600))) return rateLimitResponse();
    const { mediaId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return jsonError("Media not found.", 404);
    const sql = getDb();
    const rows = queryRows<{ id: string }>(await sql`
      UPDATE creator_media m SET status = 'published', published_at = COALESCE(published_at, now()), updated_at = now()
      WHERE m.id = ${mediaId} AND m.model_user_id = ${user.id} AND m.status IN ('draft', 'hidden')
        AND EXISTS (SELECT 1 FROM creator_media_assets x WHERE x.creator_media_id = m.id)
        AND NOT EXISTS (
          SELECT 1 FROM creator_media_assets x JOIN media_assets a ON a.id = x.media_asset_id
          WHERE x.creator_media_id = m.id AND (a.upload_status <> 'uploaded' OR a.moderation_status <> 'approved' OR a.deleted_at IS NOT NULL)
        )
      RETURNING id`);
    if (!rows[0]) return jsonError("Every file must finish uploading and pass moderator review before publication.", 409);
    return Response.json({ ok: true, status: "published" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    return jsonError("Media could not be published.", 503);
  }
}
