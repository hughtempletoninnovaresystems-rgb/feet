import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthProvider = "google" | "facebook";
export type OAuthFlow = "login" | "register";

export type OAuthAttempt = {
  provider: OAuthProvider;
  state: string;
  codeVerifier: string | null;
  flow: OAuthFlow;
  role: "client" | "model" | null;
  ageConfirmed: boolean;
  legalAccepted: boolean;
  createdAt: number;
};

export type OAuthProfile = {
  subject: string;
  email: string | null;
  displayName: string | null;
};

type OAuthConfiguration = { clientId: string; clientSecret: string; graphVersion?: string };
const ATTEMPT_TTL_MS = 10 * 60 * 1000;

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("OAuth requires an AUTH_SECRET of at least 32 characters.");
  return secret;
}

export function appOrigin() {
  const value = process.env.APP_URL;
  if (!value) throw new Error("APP_URL is required for OAuth.");
  const url = new URL(value);
  if (url.username || url.password || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw new Error("APP_URL must be a secure site origin in production.");
  }
  return url.origin;
}

export function oauthCallbackUrl(provider: OAuthProvider) {
  return new URL(`/api/auth/oauth/${provider}/callback`, appOrigin()).toString();
}

export function oauthCookieName(provider: OAuthProvider) {
  return `mfs_oauth_${provider}`;
}

export function getOAuthConfiguration(provider: OAuthProvider): OAuthConfiguration | null {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }

  const clientId = process.env.FACEBOOK_APP_ID?.trim();
  const clientSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  const graphVersion = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v22.0";
  if (!clientId || !clientSecret || !/^v\d+\.\d+$/.test(graphVersion)) return null;
  return { clientId, clientSecret, graphVersion };
}

export function createOAuthAttemptCookie(attempt: OAuthAttempt) {
  const payload = Buffer.from(JSON.stringify(attempt)).toString("base64url");
  const signature = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function sameSecret(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function readOAuthAttemptCookie(cookieValue: string | undefined, provider: OAuthProvider, returnedState: string | null): OAuthAttempt | null {
  if (!cookieValue || !returnedState || cookieValue.length > 4096) return null;
  const [payload, signature, extra] = cookieValue.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  let expectedSignature: string;
  try {
    expectedSignature = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  } catch {
    return null;
  }
  if (!sameSecret(signature, expectedSignature)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<OAuthAttempt>;
    const now = Date.now();
    if (
      decoded.provider !== provider ||
      decoded.flow !== "login" && decoded.flow !== "register" ||
      typeof decoded.state !== "string" || !sameSecret(decoded.state, returnedState) ||
      !(decoded.codeVerifier === null || typeof decoded.codeVerifier === "string") ||
      !(decoded.role === null || decoded.role === "client" || decoded.role === "model") ||
      typeof decoded.ageConfirmed !== "boolean" ||
      typeof decoded.legalAccepted !== "boolean" ||
      typeof decoded.createdAt !== "number" || decoded.createdAt > now + 30_000 || now - decoded.createdAt > ATTEMPT_TTL_MS
    ) return null;
    if (decoded.flow === "register" && (!decoded.role || !decoded.ageConfirmed || !decoded.legalAccepted)) return null;
    if (decoded.flow === "login" && (decoded.role !== null || decoded.ageConfirmed || decoded.legalAccepted)) return null;
    if (provider === "google" && !decoded.codeVerifier) return null;
    if (provider === "facebook" && decoded.codeVerifier !== null) return null;
    return decoded as OAuthAttempt;
  } catch {
    return null;
  }
}

export function createOAuthAuthorizationUrl(attempt: OAuthAttempt, configuration: OAuthConfiguration) {
  const callback = oauthCallbackUrl(attempt.provider);
  if (attempt.provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", configuration.clientId);
    url.searchParams.set("redirect_uri", callback);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", attempt.state);
    url.searchParams.set("code_challenge", createHash("sha256").update(attempt.codeVerifier!).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  const url = new URL(`https://www.facebook.com/${configuration.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "email,public_profile");
  url.searchParams.set("state", attempt.state);
  return url.toString();
}

type JsonObject = Record<string, unknown>;

async function readProviderJson(response: Response): Promise<JsonObject> {
  const value: unknown = await response.json();
  if (!response.ok || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("OAuth provider request failed.");
  return value as JsonObject;
}

function providerString(value: unknown, maxLength = 512) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

async function exchangeGoogleCode(code: string, attempt: OAuthAttempt, configuration: OAuthConfiguration): Promise<OAuthProfile> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      redirect_uri: oauthCallbackUrl("google"),
      grant_type: "authorization_code",
      code_verifier: attempt.codeVerifier!,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const token = await readProviderJson(tokenResponse);
  const accessToken = providerString(token.access_token, 4096);
  if (!accessToken) throw new Error("Google did not return an access token.");

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const user = await readProviderJson(userResponse);
  const subject = providerString(user.sub, 255);
  const email = providerString(user.email, 254);
  const emailVerified = user.email_verified === true || user.email_verified === "true";
  if (!subject || !email || !emailVerified) throw new Error("Google did not return a verified email address.");
  return { subject, email, displayName: providerString(user.name, 160) };
}

async function exchangeFacebookCode(code: string, configuration: OAuthConfiguration): Promise<OAuthProfile> {
  const version = configuration.graphVersion!;
  const tokenResponse = await fetch(`https://graph.facebook.com/${version}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      redirect_uri: oauthCallbackUrl("facebook"),
      code,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const tokenResult = await readProviderJson(tokenResponse);
  const accessToken = providerString(tokenResult.access_token, 4096);
  if (!accessToken) throw new Error("Facebook did not return an access token.");

  const debugUrl = new URL(`https://graph.facebook.com/${version}/debug_token`);
  debugUrl.searchParams.set("input_token", accessToken);
  debugUrl.searchParams.set("access_token", `${configuration.clientId}|${configuration.clientSecret}`);
  const debugResponse = await fetch(debugUrl, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const debugResult = await readProviderJson(debugResponse);
  const tokenData = debugResult.data;
  if (!tokenData || typeof tokenData !== "object" || Array.isArray(tokenData)) throw new Error("Facebook token validation failed.");
  const tokenInfo = tokenData as JsonObject;
  const expectedSubject = providerString(tokenInfo.user_id, 255);
  if (tokenInfo.is_valid !== true || tokenInfo.app_id !== configuration.clientId || !expectedSubject) {
    throw new Error("Facebook returned an invalid app token.");
  }

  const appSecretProof = createHmac("sha256", configuration.clientSecret).update(accessToken).digest("hex");
  const profileUrl = new URL(`https://graph.facebook.com/${version}/me`);
  profileUrl.searchParams.set("fields", "id,name,email");
  profileUrl.searchParams.set("appsecret_proof", appSecretProof);
  const profileResponse = await fetch(profileUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const profile = await readProviderJson(profileResponse);
  const subject = providerString(profile.id, 255);
  if (!subject || subject !== expectedSubject) throw new Error("Facebook profile did not match its validated token.");
  return {
    subject,
    email: providerString(profile.email, 254),
    displayName: providerString(profile.name, 160),
  };
}

export async function exchangeOAuthCode(provider: OAuthProvider, code: string, attempt: OAuthAttempt, configuration: OAuthConfiguration): Promise<OAuthProfile> {
  if (code.length > 4096) throw new Error("OAuth code is invalid.");
  return provider === "google"
    ? exchangeGoogleCode(code, attempt, configuration)
    : exchangeFacebookCode(code, configuration);
}
