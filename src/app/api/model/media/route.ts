import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

export const runtime = "nodejs";

const mediaSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  mediaType: z.enum(["photo_set", "video"]),
  priceTokens: z.number().int().min(1).max(1000000),
});

async function requireCreator(request: Request) {
  const user = await getSessionUser();
  if (!user) return { response: jsonError("Sign in to manage creator media.", 401) } as const;
  if (user.role !== "model" || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) {
    return { response: jsonError("An active, age-verified creator account is required.", 403) } as const;
  }
  if (!(await enforceRateLimit(request, `creator-media:${user.id}`, 60, 3600))) return { response: rateLimitResponse() } as const;
  return { user } as const;
}

export async function GET(request: Request) {
  if (!productionMarketplaceEnabled()) return jsonError("Creator uploads are unavailable until the marketplace launch gates are complete.", 503);
  const auth = await requireCreator(request);
  if ("response" in auth) return auth.response;
  const sql = getDb();
  const media = queryRows<{
    id: string; title: string; description: string; media_type: "photo_set" | "video"; price_tokens: number;
    status: string; created_at: string; assets: number; approved_assets: number;
  }>(await sql`
    SELECT m.id, m.title, m.description, m.media_type, m.price_tokens, m.status, m.created_at,
           count(a.id)::int AS assets,
           count(a.id) FILTER (WHERE a.moderation_status = 'approved' AND a.upload_status = 'uploaded')::int AS approved_assets
    FROM creator_media m LEFT JOIN creator_media_assets x ON x.creator_media_id = m.id
    LEFT JOIN media_assets a ON a.id = x.media_asset_id AND a.deleted_at IS NULL
    WHERE m.model_user_id = ${auth.user.id}
    GROUP BY m.id ORDER BY m.created_at DESC LIMIT 100`);
  return Response.json({ media }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!productionMarketplaceEnabled()) return jsonError("Creator uploads are unavailable until the marketplace launch gates are complete.", 503);
    const auth = await requireCreator(request);
    if ("response" in auth) return auth.response;
    const parsed = mediaSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Check the media details and try again.", 400);
    const sql = getDb();
    const rows = queryRows<{ id: string }>(await sql`
      INSERT INTO creator_media(model_user_id, title, description, media_type, price_tokens)
      VALUES (${auth.user.id}, ${parsed.data.title}, ${parsed.data.description}, ${parsed.data.mediaType}, ${parsed.data.priceTokens})
      RETURNING id`);
    return Response.json({ mediaId: rows[0]?.id, status: "draft" }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Check the media details and try again.", 400);
    return jsonError("Creator media could not be saved.", 503);
  }
}

