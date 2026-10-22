import { getDb, queryRows } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = getDb();
    const rows = queryRows<Record<string, boolean>>(await sql`SELECT
      to_regclass('public.users') IS NOT NULL AS users_ready,
      to_regclass('public.auth_sessions') IS NOT NULL AS sessions_ready,
      to_regclass('public.email_verification_tokens') IS NOT NULL AS verification_ready,
      to_regclass('public.password_reset_tokens') IS NOT NULL AS reset_ready,
      to_regclass('public.auth_rate_limits') IS NOT NULL AS rate_limits_ready,
      to_regclass('public.security_audit_events') IS NOT NULL AS audit_ready,
      to_regprocedure('public.consume_auth_rate_limit(text,integer,integer)') IS NOT NULL AS rate_limit_function_ready,
      to_regclass('public.age_verification_sessions') IS NOT NULL AS age_verification_ready`);
    const state = rows[0];
    if (!state || Object.values(state).some((ready) => ready !== true)) {
      return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
