import AuthScreen from "@/components/AuthScreen";
import Link from "next/link";
import { productionSignupsEnabled } from "@/lib/release-gates";

export const dynamic = "force-dynamic";

export default async function Register({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const params = await searchParams;
  const initialRole = params.role === "model" ? "model" : "client";
  if (!productionSignupsEnabled()) {
    return <main className="account-state-page"><section className="account-state-card"><span className="eyebrow">REGISTRATION CLOSED</span><h1>Sign-up is not open yet.</h1><p>Registration will open after the operator completes the required legal, adult eligibility, and service setup.</p><Link className="button button-dark" href="/">Back to home</Link></section></main>;
  }
  return <AuthScreen mode="register" initialRole={initialRole} />;
}
