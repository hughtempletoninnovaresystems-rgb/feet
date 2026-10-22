"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

type Mode = "login" | "register" | "forgot" | "reset";

export default function AuthScreen({ mode, initialRole = "client", initialToken = "" }: { mode: Mode; initialRole?: "client" | "model"; initialToken?: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<"client" | "model">(initialRole);
  const [resetToken] = useState(initialToken);
  useEffect(() => {
    if (initialToken) window.history.replaceState(null, "", window.location.pathname);
  }, [initialToken]);
  const isRegister = mode === "register";
  const isReset = mode === "reset";
  const title = mode === "login" ? "Welcome back." : mode === "forgot" ? "Let's get you back in." : isReset ? "Choose a new password." : "Your show starts here.";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const values = new FormData(event.currentTarget);
    const payload = mode === "register"
      ? { displayName: String(values.get("displayName") ?? ""), email: String(values.get("email") ?? ""), password: String(values.get("password") ?? ""), role, ageConfirmed: values.get("ageConfirmed") === "on", termsAccepted: values.get("legalAccepted") === "on", privacyAccepted: values.get("legalAccepted") === "on" }
      : mode === "login"
        ? { email: String(values.get("email") ?? ""), password: String(values.get("password") ?? "") }
        : mode === "forgot"
          ? { email: String(values.get("email") ?? "") }
          : { token: resetToken, password: String(values.get("password") ?? "") };
    const endpoint = mode === "register" ? "/api/auth/register" : mode === "login" ? "/api/auth/login" : mode === "forgot" ? "/api/auth/forgot-password" : "/api/auth/reset-password";
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { message?: string; error?: string; role?: string };
      if (!response.ok) {
        setNotice(result.error ?? "Could not complete the request. Please try again.");
      } else if (mode === "login") {
        router.push(result.role === "model" ? "/model" : "/client");
      } else if (isReset) {
        setNotice(result.message ?? "Password changed.");
        window.setTimeout(() => router.push("/login"), 900);
      } else {
        setNotice(result.message ?? "If the request can be completed, an email will arrive shortly.");
      }
    } catch {
      setNotice("The service is temporarily unavailable. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <div className="auth-side"><Link href="/" className="brand"><span className="brand-mark">m</span><span>my feet <b>show</b></span></Link><div className="auth-side-copy"><span className="eyebrow">YOUR SPACE. YOUR SHOW.</span><h1>Find your<br /><em>kind</em> of connection.</h1><p>Discover independent creators, share what you love, and keep every detail in your control.</p></div><div className="auth-side-art"><div className="auth-art-circle"/><img src="https://images.unsplash.com/photo-1662132090920-060bba5cdf18?auto=format&fit=crop&w=800&q=80" alt="Editorial pedicure and sandal detail" /><span className="auth-art-tag"><Sparkles size={14} /> Made for the details</span></div><div className="auth-side-footer">18+ only · Creator led · Thoughtfully made</div></div>
    <div className="auth-main"><Link href="/" className="auth-back"><ArrowLeft size={15}/> Back to home</Link><div className="auth-form-wrap"><span className="auth-kicker">{mode === "forgot" || isReset ? "ACCOUNT RECOVERY" : isRegister ? "JOIN THE COMMUNITY" : "GOOD TO SEE YOU"}</span><h2>{title}</h2><p className="auth-sub">{mode === "forgot" ? "Enter the email on your account and we'll send a secure reset link." : isReset ? "Use a unique password of at least 12 characters." : isRegister ? "Create an account. Access stays locked until email and adult eligibility checks are complete." : "Sign in and pick up right where you left off."}</p>
      {isRegister && <div className="role-picker"><button className={role === "client" ? "role-option selected" : "role-option"} onClick={() => setRole("client")}><span className="role-emoji">♡</span><span><b>I&apos;m here to discover</b><small>Join as a client</small></span></button><button className={role === "model" ? "role-option selected" : "role-option"} onClick={() => setRole("model")}><span className="role-emoji">✦</span><span><b>I&apos;m a creator</b><small>Share your work</small></span></button></div>}
      {mode !== "reset" && <div className="auth-divider"><span>{isRegister ? "email account" : "use your email"}</span></div>}
      <form className="auth-form" onSubmit={handleSubmit}>
        {isRegister && <label>Display name<input name="displayName" required maxLength={80} autoComplete="name" placeholder="What should we call you?" /></label>}
        {mode !== "reset" && <label>Email address<input name="email" required type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" /></label>}
        {mode !== "forgot" && <label>{isReset ? "New password" : "Password"}<div className="password-wrap"><input name="password" required type={showPassword ? "text" : "password"} autoComplete={isRegister || isReset ? "new-password" : "current-password"} placeholder={isRegister || isReset ? "At least 12 characters" : "Your password"} minLength={12} maxLength={128} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>}
        {isRegister && <><label className="check-label"><input name="ageConfirmed" type="checkbox" required /> <span>I confirm that I am 18 or older. A separate adult eligibility check is required before access.</span></label><label className="check-label"><input name="legalAccepted" type="checkbox" required /> <span>I agree to the <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy Policy</Link>.</span></label></>}
        {mode === "login" && <div className="forgot-row"><span>Keep your account safe</span><Link href="/forgot-password">Forgot password?</Link></div>}
        <button className="button button-dark auth-submit" type="submit" disabled={busy || (isReset && !resetToken)}>{busy ? "Please wait…" : mode === "login" ? "Log in" : mode === "forgot" ? "Send reset link" : isReset ? "Change password" : "Create my account"} <ArrowRight size={16}/></button>
      </form>
      {notice && <div className="inline-notice" role="status" aria-live="polite">{notice}</div>}
      {mode === "login" ? <><p className="auth-switch">New around here? <Link href="/register">Create an account</Link></p><p className="auth-switch"><Link href="/account-pending">Need another email verification link?</Link></p></> : mode === "register" ? <p className="auth-switch">Already a member? <Link href="/login">Log in</Link></p> : <p className="auth-switch"><Link href="/login">Back to log in</Link></p>}
      <p className="auth-legal">By continuing, you agree to our <Link href="/legal/terms">Terms of Service</Link> and <Link href="/legal/privacy">Privacy Policy</Link>. <Link href="/legal/safety">Safety</Link> · <Link href="/legal/cookies">Cookies</Link></p>
    </div></div>
  </main>;
}
