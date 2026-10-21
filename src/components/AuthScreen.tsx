"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type Mode = "login" | "register" | "forgot";

export default function AuthScreen({ mode }: { mode: Mode }) {
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [role, setRole] = useState("client");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("role") === "model") setRole("model");
  }, []);
  const isRegister = mode === "register";
  const title = mode === "login" ? "Welcome back." : mode === "forgot" ? "Let's get you back in." : "Your show starts here.";

  return <main className="auth-page">
    <div className="auth-side"><Link href="/" className="brand"><span className="brand-mark">m</span><span>my feet <b>show</b></span></Link><div className="auth-side-copy"><span className="eyebrow">YOUR SPACE. YOUR SHOW.</span><h1>Find your<br /><em>kind</em> of connection.</h1><p>Discover independent creators, share what you love, and keep every detail in your control.</p></div><div className="auth-side-art"><div className="auth-art-circle"/><img src="https://images.unsplash.com/photo-1662132090920-060bba5cdf18?auto=format&fit=crop&w=800&q=80" alt="Editorial pedicure and sandal detail" /><span className="auth-art-tag"><Sparkles size={14} /> Made for the details</span></div><div className="auth-side-footer">18+ only · Creator led · Thoughtfully made</div></div>
    <div className="auth-main"><Link href="/" className="auth-back"><ArrowLeft size={15}/> Back to home</Link><div className="auth-form-wrap"><span className="auth-kicker">{mode === "forgot" ? "ACCOUNT RECOVERY" : isRegister ? "JOIN THE COMMUNITY" : "GOOD TO SEE YOU"}</span><h2>{title}</h2><p className="auth-sub">{mode === "forgot" ? "Enter the email on your account and we'll send a secure reset link." : isRegister ? "A lovely little world is waiting for you." : "Sign in and pick up right where you left off."}</p>
      {isRegister && <div className="role-picker"><button className={role === "client" ? "role-option selected" : "role-option"} onClick={() => setRole("client")}><span className="role-emoji">♡</span><span><b>I'm here to discover</b><small>Join as a client</small></span></button><button className={role === "model" ? "role-option selected" : "role-option"} onClick={() => setRole("model")}><span className="role-emoji">✦</span><span><b>I'm a creator</b><small>Share your work</small></span></button></div>}
      {mode !== "forgot" && <div className="social-buttons"><button onClick={() => setSubmitted(true)}><span className="google-g">G</span> Continue with Google</button><button onClick={() => setSubmitted(true)}><span className="facebook-f">f</span> Continue with Facebook</button></div>}
      {mode !== "forgot" && <div className="auth-divider"><span>or use your email</span></div>}
      <form className="auth-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
        {isRegister && <label>Display name<input required placeholder="What should we call you?" /></label>}
        <label>Email address<input required type="email" autoComplete="email" placeholder="you@example.com" /></label>
        {mode !== "forgot" && <label>Password<div className="password-wrap"><input required type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} placeholder={isRegister ? "At least 8 characters" : "Your password"} minLength={8} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>}
        {isRegister && <label className="check-label"><input type="checkbox" required /> <span>I'm 18 or older and agree to the <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy Policy</Link>.</span></label>}
        {mode === "login" && <div className="forgot-row"><span>Keep your account safe</span><Link href="/forgot-password">Forgot password?</Link></div>}
        <button className="button button-dark auth-submit" type="submit">{mode === "login" ? "Log in" : mode === "forgot" ? "Send reset link" : "Create my account"} <ArrowRight size={16}/></button>
      </form>
      {submitted && <div className="inline-notice">{mode === "forgot" ? "If an account exists for that email, a reset link will arrive shortly." : "This starter is ready for provider setup. Connect auth credentials to enable sign-in."}</div>}
      {mode === "login" ? <p className="auth-switch">New around here? <Link href="/register">Create an account</Link></p> : mode === "register" ? <p className="auth-switch">Already a member? <Link href="/login">Log in</Link></p> : <p className="auth-switch"><Link href="/login">Back to log in</Link></p>}
      <p className="auth-legal">By continuing, you agree to our <Link href="/legal/terms">Terms of Service</Link> and <Link href="/legal/privacy">Privacy Policy</Link>. <Link href="/legal/safety">Safety</Link> · <Link href="/legal/cookies">Cookies</Link></p>
    </div></div>
  </main>;
}
