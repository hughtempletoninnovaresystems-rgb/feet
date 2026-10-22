import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { createMediaReadUrl } from "@/lib/storage";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!productionMarketplaceEnabled()) return jsonError("Creator discovery is unavailable until the marketplace launch gates are complete.", 503);
  const user = await getSessionUser();
  if (!user) return jsonError("Sign in to discover creators.", 401);
  if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) {
    return jsonError("Complete account and age verification before discovering creators.", 403);
  }

  const sql = getDb();
  const creators = queryRows<{
    id: string; display_name: string; handle: string; bio: string; location_label: string | null;
    categories: string[]; call_rate_tokens_per_minute: number; likes: number; liked: boolean;
    avatar_storage_key: string | null;
  }>(await sql`
    SELECT u.id, u.display_name, p.handle, p.bio, p.location_label, p.categories,
           p.call_rate_tokens_per_minute,
           (SELECT count(*)::int FROM profile_likes l WHERE l.target_user_id = u.id) AS likes,
           EXISTS (SELECT 1 FROM profile_likes l WHERE l.actor_user_id = ${user.id} AND l.target_user_id = u.id) AS liked,
           a.storage_key AS avatar_storage_key
    FROM users u JOIN model_profiles p ON p.user_id = u.id
    LEFT JOIN media_assets a ON a.id = u.avatar_asset_id AND a.owner_user_id = u.id
      AND a.moderation_status = 'approved' AND a.upload_status = 'uploaded' AND a.deleted_at IS NULL
    WHERE u.id <> ${user.id} AND u.role = 'model' AND u.status = 'active' AND u.closed_at IS NULL
      AND u.email_verified_at IS NOT NULL AND u.age_verified_at IS NOT NULL AND p.discoverable = true
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks b
        WHERE (b.blocker_user_id = ${user.id} AND b.blocked_user_id = u.id)
           OR (b.blocker_user_id = u.id AND b.blocked_user_id = ${user.id})
      )
    ORDER BY p.created_at DESC LIMIT 100`);

  const result = await Promise.all(creators.map(async (creator) => ({
    id: creator.id,
    name: creator.display_name,
    handle: creator.handle,
    slug: creator.handle.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    bio: creator.bio,
    location: creator.location_label ?? "",
    categories: creator.categories,
    rate: creator.call_rate_tokens_per_minute,
    likes: creator.likes,
    liked: creator.liked,
    online: false,
    avatarUrl: creator.avatar_storage_key ? await createMediaReadUrl(creator.avatar_storage_key).catch(() => null) : null,
  })));
  return Response.json({ creators: result }, { headers: { "Cache-Control": "private, no-store" } });
}
