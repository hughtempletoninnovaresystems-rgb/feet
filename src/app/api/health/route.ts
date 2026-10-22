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
      to_regclass('public.age_verification_sessions') IS NOT NULL AS age_verification_ready,
      to_regclass('public.didit_webhook_events') IS NOT NULL AS didit_webhooks_ready,
      to_regclass('public.creator_media_assets') IS NOT NULL AS creator_media_ready,
      to_regclass('public.profile_comments') IS NOT NULL AS profile_comments_ready,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'upload_status') AS upload_migration_ready,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'client_request_id') AS message_migration_ready,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'reviewed_by') AS moderation_migration_ready`);
    const state = rows[0];
    if (!state || Object.values(state).some((ready) => ready !== true)) {
      return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
