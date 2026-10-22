"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Role = "client" | "model";
type VerificationStatus = "pending" | "in_progress" | "complete" | "failed" | "error" | "cancelled" | "expired";

const statusCopy: Record<VerificationStatus, string> = {
  pending: "Yoti has not returned a final result yet. You can check again in a moment.",
  in_progress: "Yoti is still checking your verification. You can check again in a moment.",
  complete: "Your adult eligibility check is complete. Your account is now verified.",
  failed: "Yoti could not verify that you are 18 or older. You can start a new check with another available method.",
  error: "Yoti could not complete this check. You can start a new verification session.",
  cancelled: "This verification session was cancelled. Start a new check when you are ready.",
  expired: "This verification session expired. Start a new check to continue.",
};

export default function AgeVerificationClient({ role, sessionId, cancelled = false }: { role: Role; sessionId?: string; cancelled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<VerificationStatus | null>(cancelled ? "cancelled" : null);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState(0);

  async function checkStatus(id?: string) {
    setBusy(true);
    setError("");
    try {
      const endpoint = id ? `/api/age-verification/status?sessionId=${encodeURIComponent(id)}` : "/api/age-verification/status";
      const response = await fetch(endpoint, { cache: "no-store" });
      const result = await response.json() as { status?: VerificationStatus; error?: string };
      if (!response.ok || !result.status) throw new Error(result.error ?? "Could not check verification status.");
      setStatus(result.status);
      setChecks((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check verification status.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!sessionId) {
      if (!cancelled) return;
      let active = true;
      void fetch("/api/age-verification/status", { cache: "no-store" })
        .then(async (response) => {
          const result = await response.json() as { status?: VerificationStatus; error?: string };
          if (!response.ok || !result.status) throw new Error(result.error ?? "Could not check verification status.");
          if (active) setStatus(result.status);
        })
        .catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : "Could not check verification status.");
        });
      return () => { active = false; };
    }
    const currentSessionId = sessionId;
    let active = true;
    let attempts = 0;
    let timer: number | undefined;
    async function poll() {
      if (!active) return;
      attempts += 1;
      try {
        const response = await fetch(`/api/age-verification/status?sessionId=${encodeURIComponent(currentSessionId)}`, { cache: "no-store" });
        const result = await response.json() as { status?: VerificationStatus; error?: string };
        if (!response.ok || !result.status) throw new Error(result.error ?? "Could not check verification status.");
        if (!active) return;
        setStatus(result.status);
        setChecks(attempts);
        if ((result.status === "pending" || result.status === "in_progress") && attempts < 3) {
          timer = window.setTimeout(poll, 5000);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not check verification status.");
      }
    }
    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [cancelled, sessionId]);

  async function startVerification() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/age-verification/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json() as { sessionUrl?: string; error?: string };
      if (!response.ok || !result.sessionUrl) throw new Error(result.error ?? "Could not start age verification.");
      const destination = new URL(result.sessionUrl);
      if (destination.origin !== "https://age.yoti.com") throw new Error("The verification provider returned an invalid link.");
      window.location.assign(destination.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start age verification.");
      setBusy(false);
    }
  }

  const checkAgain = sessionId && (error || ((status === "pending" || status === "in_progress") && checks >= 3));
  return <main className="account-state-page"><section className="account-state-card">
    <span className="eyebrow">ADULT ELIGIBILITY</span>
    <h1>{sessionId ? "Checking your age." : "Verify your age to continue."}</h1>
    {sessionId ? <p>{status ? statusCopy[status] : "Checking the result securely with Yoti…"}</p> : <p>Use Yoti to confirm that you are 18 or older. My Feet Show receives the check result and does not receive or store your ID document or selfie.</p>}
    {!sessionId && status !== "pending" && status !== "in_progress" && <button className="button button-dark" type="button" onClick={startVerification} disabled={busy}>{busy ? "Opening Yoti…" : "Continue with Yoti"}</button>}
    {!sessionId && (status === "pending" || status === "in_progress") && <button className="button button-dark" type="button" onClick={() => void checkStatus()} disabled={busy}>{busy ? "Checking…" : "Check result again"}</button>}
    {checkAgain && <button className="button button-dark" type="button" onClick={() => void checkStatus(sessionId)} disabled={busy}>{busy ? "Checking…" : "Check result again"}</button>}
    {sessionId && (status === "failed" || status === "error" || status === "cancelled" || status === "expired") ? <button className="button button-dark" type="button" onClick={startVerification} disabled={busy}>{busy ? "Starting…" : "Start a new check"}</button> : null}
    {status === "complete" && <Link className="button button-dark" href={role === "model" ? "/model" : "/client"}>Continue to my account</Link>}
    {error && <p className="inline-notice" role="alert">{error}</p>}
    <p><Link href="/account-pending">Back to account status</Link> · <Link href="/legal/privacy">Privacy information</Link></p>
  </section></main>;
}
