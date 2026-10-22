import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError("Sign in to view blocked members.", 401);
  if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) return jsonError("An active, age-verified account is required.", 403);
  const sql = getDb();
  const blocked = queryRows<{ user_id: string; display_name: string; role: "client" | "model"; created_at: string }>(await sql`
    SELECT u.id AS user_id, u.display_name, u.role, b.created_at
    FROM user_blocks b JOIN users u ON u.id = b.blocked_user_id
    WHERE b.blocker_user_id = ${user.id} AND u.closed_at IS NULL
    ORDER BY b.created_at DESC LIMIT 500`);
  return Response.json({ blocked }, { headers: { "Cache-Control": "private, no-store" } });
}
