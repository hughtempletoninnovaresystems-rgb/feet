import "server-only";

const YOTI_API = "https://age.yoti.com/api/v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type YotiCredentials = { apiKey: string; sdkId: string; appUrl: string };
export type YotiSessionResult = {
  id: string;
  sdk_id: string;
  reference_id: string;
  type: string;
  status: string;
};

export function getYotiCredentials(): YotiCredentials | null {
  const apiKey = process.env.YOTI_API_KEY?.trim();
  const sdkId = process.env.YOTI_SDK_ID?.trim();
  const appUrl = process.env.APP_URL?.trim();
  if (!apiKey || !sdkId || !appUrl || !/^[a-zA-Z0-9_-]{14,40}$/.test(sdkId)) return null;
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return null;
  } catch {
    return null;
  }
  return { apiKey, sdkId, appUrl: appUrl.replace(/\/$/, "") };
}

function isYotiSession(value: unknown): value is { id: string; expires_at: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && UUID.test(candidate.id) &&
    typeof candidate.expires_at === "string" && Number.isFinite(Date.parse(candidate.expires_at));
}

function isYotiResult(value: unknown): value is YotiSessionResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && UUID.test(candidate.id) &&
    typeof candidate.sdk_id === "string" && typeof candidate.reference_id === "string" &&
    typeof candidate.type === "string" && typeof candidate.status === "string";
}

async function providerRequest(url: string, credentials: YotiCredentials, init?: RequestInit) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      "Content-Type": "application/json",
      "Yoti-Sdk-Id": credentials.sdkId,
      ...init?.headers,
    },
  });
}

export async function createYotiAgeSession(credentials: YotiCredentials, referenceId: string) {
  const response = await providerRequest(`${YOTI_API}/sessions`, credentials, {
    method: "POST",
    body: JSON.stringify({
      type: "OVER",
      age_estimation: {
        allowed: true,
        threshold: 21,
        retry_enabled: true,
        retry_limit: 2,
        level: "PASSIVE",
      },
      digital_id: {
        allowed: true,
        threshold: 18,
        age_estimation_allowed: true,
        age_estimation_threshold: 21,
        retry_enabled: true,
        retry_limit: 2,
      },
      doc_scan: {
        allowed: true,
        threshold: 18,
        retry_enabled: true,
        retry_limit: 2,
        level: "PASSIVE",
        authenticity: "AUTO",
      },
      ttl: 900,
      reference_id: referenceId,
      callback: { url: `${credentials.appUrl}/age-verification/complete`, auto: true },
      cancel_url: `${credentials.appUrl}/age-verification?cancelled=1`,
      privacy_policy: `${credentials.appUrl}/legal/privacy`,
      terms_and_conditions: `${credentials.appUrl}/legal/terms`,
      synchronous_checks: true,
    }),
  });
  if (!response.ok) throw new Error("Yoti session creation failed.");
  const payload: unknown = await response.json();
  if (!isYotiSession(payload)) throw new Error("Yoti returned an invalid session response.");
  return payload;
}

export async function getYotiAgeResult(credentials: YotiCredentials, sessionId: string) {
  const response = await providerRequest(`${YOTI_API}/sessions/${encodeURIComponent(sessionId)}/result`, credentials);
  if (!response.ok) throw new Error("Yoti result retrieval failed.");
  const payload: unknown = await response.json();
  if (!isYotiResult(payload)) throw new Error("Yoti returned an invalid result response.");
  return payload;
}

export function yotiStatusToLocal(status: string) {
  switch (status) {
    case "COMPLETE": return "complete" as const;
    case "FAIL": return "failed" as const;
    case "ERROR": return "error" as const;
    case "CANCELLED": return "cancelled" as const;
    case "EXPIRED": return "expired" as const;
    case "IN_PROGRESS": return "in_progress" as const;
    case "PENDING": return "pending" as const;
    default: return null;
  }
}
