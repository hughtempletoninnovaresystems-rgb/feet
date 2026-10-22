import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  displayName: z.string().trim().min(1).max(80),
  handle: z.string().trim().toLowerCase().max(50).regex(/^@?[a-z0-9]+(?:-[a-z0-9]+)*$/),
  bio: z.string().trim().max(2000),
  location: z.string().trim().max(120),
  callRate: z.number().int().min(1).max(100000),
  defaultPhotoPrice: z.number().int().min(1).max(100000),
  defaultVideoPrice: z.number().int().min(1).max(100000),
  allowLikes: z.boolean(),
  allowComments: z.boolean(),
  showOnlineStatus: z.boolean(),
});

async function account(request?: Request) {
  const user = await getSessionUser();
  if (!user) return { response: jsonError("Sign in to manage your profile.", 401) } as const;
  if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) return { response: jsonError("An active, age-verified account is required.", 403) } as const;
  if (request && !(await enforceRateLimit(request, `profile-settings:${user.id}`, 30, 900))) return { response: rateLimitResponse() } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await account();
  if ("response" in auth) return auth.response;
  const sql = getDb();
  if (auth.user.role === "model") {
    const profile = queryRows<Record<string, unknown>>(await sql`
      SELECT u.display_name AS "displayName", p.handle, p.bio, COALESCE(p.location_label, '') AS location,
             p.call_rate_tokens_per_minute AS "callRate", p.default_photo_price_tokens AS "defaultPhotoPrice",
             p.default_video_price_tokens AS "defaultVideoPrice", p.allow_likes AS "allowLikes",
             p.allow_comments AS "allowComments", p.show_online_status AS "showOnlineStatus"
      FROM users u JOIN model_profiles p ON p.user_id = u.id WHERE u.id = ${auth.user.id} LIMIT 1`)[0];
    return Response.json({ profile }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const profile = queryRows<Record<string, unknown>>(await sql`
    SELECT u.display_name AS "displayName", p.handle, p.bio, COALESCE(p.location_label, '') AS location,
           18 AS "callRate", 12 AS "defaultPhotoPrice", 24 AS "defaultVideoPrice",
           p.allow_likes AS "allowLikes", p.allow_comments AS "allowComments", p.show_online_status AS "showOnlineStatus"
    FROM users u JOIN client_profiles p ON p.user_id = u.id WHERE u.id = ${auth.user.id} LIMIT 1`)[0];
  return Response.json({ profile }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await account(request);
    if ("response" in auth) return auth.response;
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Check your profile details and try again.", 400);
    const values = parsed.data;
    const handle = values.handle.startsWith("@") ? values.handle : `@${values.handle}`;
    const sql = getDb();
    if (auth.user.role === "model") {
      await sql`WITH changed_user AS (
                  UPDATE users SET display_name = ${values.displayName}, updated_at = now() WHERE id = ${auth.user.id} RETURNING id
                ), changed_profile AS (
                  UPDATE model_profiles SET handle = ${handle}, bio = ${values.bio}, location_label = NULLIF(${values.location}, ''),
                    call_rate_tokens_per_minute = ${values.callRate}, default_photo_price_tokens = ${values.defaultPhotoPrice},
                    default_video_price_tokens = ${values.defaultVideoPrice}, allow_likes = ${values.allowLikes},
                    allow_comments = ${values.allowComments}, show_online_status = ${values.showOnlineStatus}, updated_at = now()
                  WHERE user_id IN (SELECT id FROM changed_user) RETURNING user_id
                ), audit AS (
                  INSERT INTO security_audit_events(actor_user_id, event_type, subject_user_id)
                  SELECT id, 'profile_settings_updated', id FROM changed_profile RETURNING id
                ) SELECT user_id FROM changed_profile`;
    } else {
      await sql`WITH changed_user AS (
                  UPDATE users SET display_name = ${values.displayName}, updated_at = now() WHERE id = ${auth.user.id} RETURNING id
                ), changed_profile AS (
                  UPDATE client_profiles SET handle = ${handle}, bio = ${values.bio}, location_label = NULLIF(${values.location}, ''),
                    allow_likes = ${values.allowLikes}, allow_comments = ${values.allowComments},
                    show_online_status = ${values.showOnlineStatus}, updated_at = now()
                  WHERE user_id IN (SELECT id FROM changed_user) RETURNING user_id
                ), audit AS (
                  INSERT INTO security_audit_events(actor_user_id, event_type, subject_user_id)
                  SELECT id, 'profile_settings_updated', id FROM changed_profile RETURNING id
                ) SELECT user_id FROM changed_profile`;
    }
    return Response.json({ ok: true, handle }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Check your profile details and try again.", 400);
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return jsonError("That username is already in use.", 409);
    return jsonError("Profile settings could not be saved.", 503);
  }
}
