import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError, rateLimitResponse, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";

export const runtime = "nodejs";
const schema = z.object({ blocked: z.boolean() });

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in to manage blocks.", 401);
    if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) return jsonError("An active, age-verified account is required.", 403);
    if (!(await enforceRateLimit(request, `user-block:${user.id}`, 30, 900))) return rateLimitResponse();
    const { userId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(userId) || userId === user.id) return jsonError("Choose a valid member to block.", 400);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Choose whether to block or unblock this member.", 400);
    const sql = getDb();
    const target = queryRows<{ id: string }>(await sql`SELECT id FROM users WHERE id = ${userId} AND role IN ('client', 'model') AND status = 'active' AND closed_at IS NULL LIMIT 1`)[0];
    if (!target) return jsonError("Member not found.", 404);
    if (parsed.data.blocked) await sql`INSERT INTO user_blocks(blocker_user_id, blocked_user_id) VALUES (${user.id}, ${userId}) ON CONFLICT DO NOTHING`;
    else await sql`DELETE FROM user_blocks WHERE blocker_user_id = ${user.id} AND blocked_user_id = ${userId}`;
    return Response.json({ ok: true, blocked: parsed.data.blocked }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Choose whether to block or unblock this member.", 400);
    return jsonError("The block setting could not be saved.", 503);
  }
}
