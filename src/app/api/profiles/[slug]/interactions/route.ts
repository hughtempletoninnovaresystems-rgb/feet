import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("like") }),
  z.object({ action: z.literal("unlike") }),
  z.object({ action: z.literal("block") }),
  z.object({ action: z.literal("unblock") }),
  z.object({ action: z.literal("comment"), body: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("report"), reason: z.string().trim().min(2).max(120), details: z.string().trim().max(2000).default("") }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertSameOrigin(request);
    if (!productionMarketplaceEnabled()) return jsonError("Profile interactions are unavailable until the marketplace launch gates are complete.", 503);
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in to interact with this profile.", 401);
    if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) {
      return jsonError("Complete account and age verification before interacting.", 403);
    }
    if (!(await enforceRateLimit(request, `profile-interaction:${user.id}`, 30, 900))) return rateLimitResponse();
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Check the interaction details and try again.", 400);
    const { slug } = await params;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return jsonError("Profile not found.", 404);

    const sql = getDb();
    const targets = queryRows<{ id: string; allow_likes: boolean; allow_comments: boolean }>(await sql`
      SELECT u.id, p.allow_likes, p.allow_comments
      FROM users u JOIN model_profiles p ON p.user_id = u.id
      WHERE trim(both '-' from regexp_replace(regexp_replace(lower(p.handle), '^@', ''), '[^a-z0-9]+', '-', 'g')) = ${slug}
        AND u.status = 'active' AND u.closed_at IS NULL
        AND u.email_verified_at IS NOT NULL AND u.age_verified_at IS NOT NULL AND p.discoverable = true
      LIMIT 1`);
    const target = targets[0];
    if (!target || target.id === user.id) return jsonError("Profile not found.", 404);

    const { action } = parsed.data;
    if (action === "block") {
      await sql`INSERT INTO user_blocks(blocker_user_id, blocked_user_id)
                VALUES (${user.id}, ${target.id}) ON CONFLICT DO NOTHING`;
      return Response.json({ ok: true, blocked: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "unblock") {
      await sql`DELETE FROM user_blocks WHERE blocker_user_id = ${user.id} AND blocked_user_id = ${target.id}`;
      return Response.json({ ok: true, blocked: false }, { headers: { "Cache-Control": "no-store" } });
    }

    const blocked = queryRows<{ blocked: boolean }>(await sql`
      SELECT EXISTS (
        SELECT 1 FROM user_blocks
        WHERE (blocker_user_id = ${user.id} AND blocked_user_id = ${target.id})
           OR (blocker_user_id = ${target.id} AND blocked_user_id = ${user.id})
      ) AS blocked`)[0]?.blocked;
    if (blocked) return jsonError("This interaction is unavailable.", 403);

    if (action === "like" || action === "unlike") {
      if (!target.allow_likes) return jsonError("Likes are disabled for this profile.", 403);
      if (action === "like") {
        await sql`INSERT INTO profile_likes(actor_user_id, target_user_id)
                  VALUES (${user.id}, ${target.id}) ON CONFLICT DO NOTHING`;
      } else {
        await sql`DELETE FROM profile_likes WHERE actor_user_id = ${user.id} AND target_user_id = ${target.id}`;
      }
      return Response.json({ ok: true, liked: action === "like" }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "comment") {
      if (!target.allow_comments) return jsonError("Comments are disabled for this profile.", 403);
      const rows = queryRows<{ id: string }>(await sql`
        INSERT INTO profile_comments(author_user_id, target_user_id, body, status)
        VALUES (${user.id}, ${target.id}, ${parsed.data.body}, 'pending') RETURNING id`);
      return Response.json({ ok: true, commentId: rows[0]?.id, status: "pending" }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }

    const report = parsed.data;
    await sql`INSERT INTO reports(reporter_user_id, reported_user_id, target_kind, target_id, reason, details)
              VALUES (${user.id}, ${target.id}, 'profile', ${target.id}, ${report.reason}, ${report.details})`;
    return Response.json({ ok: true, status: "open" }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Check the interaction details and try again.", 400);
    return jsonError("The interaction could not be saved. Please try again later.", 503);
  }
}
