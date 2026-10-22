"use client";

import { useState, type FormEvent } from "react";

export default function ResendVerificationForm() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const email = new FormData(event.currentTarget).get("email");
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(email ?? "") }),
      });
      const result = await response.json() as { message?: string; error?: string };
      setNotice(result.message ?? result.error ?? "If verification is still needed, an email will arrive shortly.");
    } catch {
      setNotice("Could not send the email right now. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="account-resend-form" onSubmit={submit}>
    <label>Email address<input type="email" name="email" required maxLength={254} autoComplete="email" /></label>
    <button className="button button-light" type="submit" disabled={busy}>{busy ? "Sending…" : "Resend verification email"}</button>
    {notice && <p className="account-state-notice" role="status" aria-live="polite">{notice}</p>}
  </form>;
}
