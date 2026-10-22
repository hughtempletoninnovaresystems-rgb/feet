import { z } from "zod";
import { assertSameOrigin, enforceRateLimit } from "@/lib/auth";
import { jsonError, normalizedEmail, rateLimitResponse, readJson } from "@/lib/api";
import { issuePasswordResetEmail } from "@/lib/auth-emails";
import { getDb, queryRows } from "@/lib/db";

export const runtime = "nodejs";
const inputSchema = z.object({ email: z.string().trim().email().max(254) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = inputSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Enter a valid email address.", 400);
    const email = normalizedEmail(parsed.data.email);
    if (!(await enforceRateLimit(request, "password-reset-ip", 20, 3600)) || !(await enforceRateLimit(request, `password-reset-email:${email}`, 4, 3600, false))) return rateLimitResponse();
    const sql = getDb();
    const rows = queryRows<{ id: string; email: string }>(await sql`SELECT id, email FROM users WHERE lower(email) = ${email} LIMIT 1`);
    const user = rows[0];
    if (user) {
      try { await issuePasswordResetEmail(user.id, user.email); } catch { /* Avoid exposing account existence or provider status. */ }
    }
    return Response.json({ message: "If an account exists for that address, a reset link will arrive shortly." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Enter a valid email address.", 400);
    return jsonError("Could not process the request. Please try again later.", 503);
  }
}
