import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import ResendVerificationForm from "@/components/ResendVerificationForm";

export const dynamic = "force-dynamic";

export default async function AccountPending() {
  const user = await getSessionUser();
  const canVerifyAge = user?.email_verified_at && user.status === "pending" && !user.age_verified_at;
  const message = canVerifyAge
    ? "Your email is verified. Complete the Didit adult eligibility check to unlock account access."
    : user?.email_verified_at
      ? "Your account is not currently eligible for access. Contact support if you think this is a mistake."
      : "Your account remains locked until you verify your email and complete the adult eligibility check.";
  return <main className="account-state-page"><section className="account-state-card"><span className="eyebrow">ACCOUNT STATUS</span><h1>One more step before access.</h1><p>{message}</p>
    {canVerifyAge && <Link className="button button-dark" href="/age-verification">Continue with Didit</Link>}
    {!user?.email_verified_at && <><p>Already registered? Enter your email to request a fresh verification link.</p><ResendVerificationForm /></>}
    <p><Link href="/login">Back to sign in</Link> · <Link href="/">Back to home</Link></p>
  </section></main>;
}
