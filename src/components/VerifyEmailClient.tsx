"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

export default function VerifyEmailClient({ token }: { token: string }) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  async function verify() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json() as { message?: string; error?: string };
      setNotice(response.ok ? data.message ?? "Email verified." : data.error ?? "This link is invalid or expired.");
    } catch {
      setNotice("The service is temporarily unavailable. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json() as { message?: string; error?: string };
      setNotice(response.ok ? data.message ?? "If verification is needed, an email will arrive shortly." : data.error ?? "Could not process the request.");
    } catch {
      setNotice("The service is temporarily unavailable. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="account-state-page"><section className="account-state-card"><span className="eyebrow">EMAIL VERIFICATION</span><h1>Confirm your email.</h1><p>Use the button to confirm this one-time link. Opening the page alone does not consume the link.</p>{token ? <button className="button button-dark" disabled={busy} onClick={verify}>{busy ? "Please wait…" : "Verify email"}</button> : <p>This verification link is missing its token.</p>}{notice && <p className="account-state-notice" role="status" aria-live="polite">{notice}</p>}<details><summary>Need another verification email?</summary><form className="account-resend-form" onSubmit={resend}><label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254}/></label><button className="button button-outline" disabled={busy}>Resend verification email</button></form></details><Link href="/login">Back to sign in</Link></section></main>;
}
