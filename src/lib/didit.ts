import "server-only";

const DIDIT_API = "https://verification.didit.me/v3";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DiditCredentials = { apiKey: string; workflowId: string; appUrl: string };
export type DiditAgeDecision = {
  session_id: string;
  status: string;
  liveness_checks?: Array<{ status?: string; age_estimation?: number | null }>;
};

export function getDiditCredentials(): DiditCredentials | null {
  const apiKey = process.env.DIDIT_API_KEY?.trim();
  const workflowId = process.env.DIDIT_WORKFLOW_ID?.trim();
  const appUrl = process.env.APP_URL?.trim();
  if (!apiKey || !workflowId || !UUID.test(workflowId) || !appUrl) return null;
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return null;
  } catch {
    return null;
  }
  return { apiKey, workflowId, appUrl: appUrl.replace(/\/$/, "") };
}

function isSession(value: unknown): value is { session_id: string; url: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.session_id !== "string" || !UUID.test(candidate.session_id) || typeof candidate.url !== "string") return false;
  try {
    return new URL(candidate.url).origin === "https://verify.didit.me";
  } catch {
    return false;
  }
}

function isDecision(value: unknown): value is DiditAgeDecision {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.session_id === "string" && UUID.test(candidate.session_id) &&
    typeof candidate.status === "string" &&
    (candidate.liveness_checks === undefined || Array.isArray(candidate.liveness_checks));
}

export function hasDiditAgeEvidence(decision: DiditAgeDecision) {
  return decision.liveness_checks?.some((check) =>
    check && typeof check.age_estimation === "number" && Number.isFinite(check.age_estimation) && check.age_estimation >= 0,
  ) ?? false;
}

export async function createDiditAgeSession(credentials: DiditCredentials, referenceId: string) {
  const response = await fetch(`${DIDIT_API}/session/`, {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "x-api-key": credentials.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow_id: credentials.workflowId,
      callback: `${credentials.appUrl}/age-verification/complete`,
      callback_method: "initiator",
      vendor_data: referenceId,
      language: "en",
    }),
  });
  if (!response.ok) throw new Error("Didit session creation failed.");
  const payload: unknown = await response.json();
  if (!isSession(payload)) throw new Error("Didit returned an invalid session response.");
  return { id: payload.session_id, url: payload.url };
}

export async function getDiditAgeDecision(credentials: DiditCredentials, sessionId: string) {
  const response = await fetch(`${DIDIT_API}/session/${encodeURIComponent(sessionId)}/decision/`, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { "x-api-key": credentials.apiKey },
  });
  if (!response.ok) throw new Error("Didit decision retrieval failed.");
  const payload: unknown = await response.json();
  if (!isDecision(payload)) throw new Error("Didit returned an invalid decision response.");
  return payload;
}

export function diditStatusToLocal(status: string) {
  switch (status) {
    case "Approved": return "complete" as const;
    case "Declined": return "failed" as const;
    case "In Review":
    case "Not Started":
    case "Awaiting User": return "pending" as const;
    case "In Progress":
    case "Resubmitted": return "in_progress" as const;
    case "Abandoned": return "cancelled" as const;
    case "Expired":
    case "Kyc Expired": return "expired" as const;
    default: return null;
  }
}
