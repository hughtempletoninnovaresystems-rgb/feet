import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in required.", 401);
    if (user.status !== "active" || !user.email_verified_at || !user.age_verified_at) return jsonError("Account checks are incomplete.", 403);
    return Response.json({ id: user.id, displayName: user.display_name, role: user.role }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return jsonError("Could not load the account.", 503);
  }
}
