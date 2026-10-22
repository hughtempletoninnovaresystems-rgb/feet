import { z } from "zod";
import { assertSameOrigin, enforceRateLimit, hashPassword, hashPrivateValue } from "@/lib/auth";
import { jsonError, normalizedEmail, rateLimitResponse, readJson } from "@/lib/api";
import { issueVerificationEmail } from "@/lib/auth-emails";
import { getDb, queryRows } from "@/lib/db";
import { productionSignupsEnabled } from "@/lib/release-gates";

export const runtime = "nodejs";

const inputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  role: z.enum(["client", "model"]),
  ageConfirmed: z.literal(true),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!(await enforceRateLimit(request, "register", 5, 3600))) return rateLimitResponse();
    const parsed = inputSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Check the form fields and try again. Passwords must be at least 12 characters.", 400);

    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.APP_URL) {
      return jsonError("Account registration is temporarily unavailable. Please try again later.", 503);
    }
    if (!productionSignupsEnabled()) {
      return jsonError("Registration will open after the operator completes the required legal, adult eligibility, and service setup.", 503);
    }

    const email = normalizedEmail(parsed.data.email);
    const passwordHash = await hashPassword(parsed.data.password);
    const ipHash = request.headers.get("x-real-ip") ? hashPrivateValue(request.headers.get("x-real-ip")!) : null;
    const userAgentHash = request.headers.get("user-agent") ? hashPrivateValue(request.headers.get("user-agent")!) : null;
    const termsVersion = process.env.LEGAL_TERMS_VERSION || "draft-2026-10-21";
    const privacyVersion = process.env.LEGAL_PRIVACY_VERSION || "draft-2026-10-21";
    const sql = getDb();
    const rows = queryRows<{ id: string; email: string }>(await sql`
      WITH new_user AS (
        INSERT INTO users(email, password_hash, role, display_name)
        VALUES (${email}, ${passwordHash}, ${parsed.data.role}, ${parsed.data.displayName})
        RETURNING id, email
      ), new_client_profile AS (
        INSERT INTO client_profiles(user_id, handle)
        SELECT id, '@' || COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(${parsed.data.displayName}), '[^a-z0-9]+', '-', 'g')), ''), 'member')
          || '-' || left(replace(id::text, '-', ''), 8)
        FROM new_user WHERE ${parsed.data.role} = 'client'
        RETURNING user_id
      ), new_model_profile AS (
        INSERT INTO model_profiles(user_id, handle)
        SELECT id, '@' || COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(${parsed.data.displayName}), '[^a-z0-9]+', '-', 'g')), ''), 'creator')
          || '-' || left(replace(id::text, '-', ''), 8)
        FROM new_user WHERE ${parsed.data.role} = 'model'
        RETURNING user_id
      ), new_identity AS (
        INSERT INTO auth_identities(user_id, provider, provider_subject)
        SELECT id, 'email', email FROM new_user RETURNING user_id
      ), accepted_terms AS (
        INSERT INTO legal_acceptances(user_id, document_key, document_version, ip_hash, user_agent_hash)
        SELECT id, 'terms', ${termsVersion}, ${ipHash}, ${userAgentHash} FROM new_user RETURNING user_id
      ), accepted_privacy AS (
        INSERT INTO legal_acceptances(user_id, document_key, document_version, ip_hash, user_agent_hash)
        SELECT id, 'privacy', ${privacyVersion}, ${ipHash}, ${userAgentHash} FROM new_user RETURNING user_id
      ), audit_event AS (
        INSERT INTO security_audit_events(actor_user_id, subject_user_id, event_type)
        SELECT id, id, 'account_registered' FROM new_user RETURNING id
      )
      SELECT id, email FROM new_user`);

    const user = rows[0];
    if (!user) return jsonError("Account registration could not be completed.", 500);
    try {
      await issueVerificationEmail(user.id, user.email);
    } catch {
      // Keep the response deliberately generic. The resend flow can issue a new link.
      return Response.json({ message: "If the account can be registered, a verification email will arrive shortly." }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ message: "If the account can be registered, a verification email will arrive shortly." }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return Response.json({ message: "If the account can be registered, a verification email will arrive shortly." }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof SyntaxError) return jsonError("Check the form fields and try again.", 400);
    return jsonError("Account registration could not be completed. Please try again later.", 503);
  }
}
