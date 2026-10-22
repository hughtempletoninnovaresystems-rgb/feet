import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, enforceRateLimit } from "@/lib/auth";
import { jsonError, rateLimitResponse, readJson } from "@/lib/api";
import {
  createOAuthAttemptCookie,
  createOAuthAuthorizationUrl,
  getOAuthConfiguration,
  oauthCookieName,
  type OAuthAttempt,
  type OAuthProvider,
} from "@/lib/oauth-providers";
import { productionSignupsEnabled } from "@/lib/release-gates";

export const runtime = "nodejs";

const loginSchema = z.object({ flow: z.literal("login") });
const registerSchema = z.object({
  flow: z.literal("register"),
  role: z.enum(["client", "model"]),
  ageConfirmed: z.literal(true),
  legalAccepted: z.literal(true),
});
const inputSchema = z.discriminatedUnion("flow", [loginSchema, registerSchema]);

function isProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "facebook";
}

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    assertSameOrigin(request);
    const { provider: providerParam } = await context.params;
    if (!isProvider(providerParam)) return jsonError("This sign-in provider is unavailable.", 404);
    const provider = providerParam;
    if (!(await enforceRateLimit(request, `oauth-start:${provider}`, 10, 900))) return rateLimitResponse();

    const parsed = inputSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Check the registration details and try again.", 400);
    if (parsed.data.flow === "register") {
      if (!productionSignupsEnabled()) {
        return jsonError("Registration will open after the operator completes the required legal, adult eligibility, and service setup.", 503);
      }
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.APP_URL) {
        return jsonError("Account registration is temporarily unavailable. Please try again later.", 503);
      }
    }

    const configuration = getOAuthConfiguration(provider);
    if (!configuration) return jsonError("This sign-in provider is temporarily unavailable.", 503);

    const attempt: OAuthAttempt = {
      provider,
      state: randomBytes(32).toString("base64url"),
      codeVerifier: provider === "google" ? randomBytes(32).toString("base64url") : null,
      flow: parsed.data.flow,
      role: parsed.data.flow === "register" ? parsed.data.role : null,
      ageConfirmed: parsed.data.flow === "register",
      legalAccepted: parsed.data.flow === "register",
      createdAt: Date.now(),
    };
    const response = NextResponse.json({ authorizationUrl: createOAuthAuthorizationUrl(attempt, configuration) }, {
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(oauthCookieName(provider), createOAuthAttemptCookie(attempt), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/api/auth/oauth/${provider}/callback`,
      maxAge: 600,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof Error && error.message === "Request body is too large.") return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError("Check the registration details and try again.", 400);
    return jsonError("This sign-in provider is temporarily unavailable.", 503);
  }
}
