import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!productionMarketplaceEnabled()) return jsonError("Creator profiles are unavailable until the marketplace launch gates are complete.", 503);
  const user = await getSessionUser();
  if (!user) return jsonError("Sign in to view creator profiles.", 401);
  if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) {
    return jsonError("Complete account and age verification before viewing profiles.", 403);
  }

  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return jsonError("Profile not found.", 404);
  const sql = getDb();
  const profiles = queryRows<{
    id: string; display_name: string; handle: string; bio: string; location_label: string | null;
    categories: string[]; call_rate_tokens_per_minute: number; allow_likes: boolean;
    allow_comments: boolean; likes: number; liked: boolean; blocked: boolean;
  }>(await sql`
    SELECT u.id, u.display_name, p.handle, p.bio, p.location_label, p.categories,
           p.call_rate_tokens_per_minute, p.allow_likes, p.allow_comments,
           (SELECT count(*)::int FROM profile_likes l WHERE l.target_user_id = u.id) AS likes,
           EXISTS (SELECT 1 FROM profile_likes l WHERE l.actor_user_id = ${user.id} AND l.target_user_id = u.id) AS liked,
           EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_user_id = ${user.id} AND b.blocked_user_id = u.id) AS blocked
    FROM users u JOIN model_profiles p ON p.user_id = u.id
    WHERE trim(both '-' from regexp_replace(regexp_replace(lower(p.handle), '^@', ''), '[^a-z0-9]+', '-', 'g')) = ${slug}
      AND u.status = 'active' AND u.closed_at IS NULL
      AND u.email_verified_at IS NOT NULL AND u.age_verified_at IS NOT NULL
      AND p.discoverable = true
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_user_id = u.id AND b.blocked_user_id = ${user.id})
    LIMIT 1`);
  const profile = profiles[0];
  if (!profile) return jsonError("Profile not found.", 404);

  const comments = queryRows<{ id: string; display_name: string; body: string; created_at: string }>(await sql`
    SELECT c.id, u.display_name, c.body, c.created_at
    FROM profile_comments c JOIN users u ON u.id = c.author_user_id
    WHERE c.target_user_id = ${profile.id} AND c.status = 'visible'
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_user_id = ${user.id} AND b.blocked_user_id = c.author_user_id)
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocked_user_id = ${user.id} AND b.blocker_user_id = c.author_user_id)
    ORDER BY c.created_at DESC LIMIT 50`);

  const media = queryRows<{ id: string; title: string; description: string; media_type: string; price_tokens: number; published_at: string }>(await sql`
    SELECT m.id, m.title, m.description, m.media_type, m.price_tokens, m.published_at
    FROM creator_media m
    WHERE m.model_user_id = ${profile.id} AND m.status = 'published'
      AND EXISTS (SELECT 1 FROM creator_media_assets x JOIN media_assets a ON a.id = x.media_asset_id
        WHERE x.creator_media_id = m.id AND a.moderation_status = 'approved' AND a.upload_status = 'uploaded' AND a.deleted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM creator_media_assets x JOIN media_assets a ON a.id = x.media_asset_id
        WHERE x.creator_media_id = m.id AND (a.moderation_status <> 'approved' OR a.upload_status <> 'uploaded' OR a.deleted_at IS NOT NULL))
    ORDER BY m.published_at DESC LIMIT 50`);

  return Response.json({ profile, comments, media, canMessage: user.role === "client" }, { headers: { "Cache-Control": "private, no-store" } });
}
