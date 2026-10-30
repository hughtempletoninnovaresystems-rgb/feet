import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { forumPaySandboxPayoutsEnabled, forumPaySandboxEnabled } from "@/lib/forumpay";

export default async function PreviewOnly() {
  if (forumPaySandboxEnabled()) {
    const user = await getSessionUser();
    if (user?.role === "model" && user.status === "active" && user.email_verified_at && user.age_verified_at && forumPaySandboxPayoutsEnabled()) redirect("/sandbox/payouts");
    if (user?.role === "client" && user.status === "active" && user.email_verified_at && user.age_verified_at) {
      redirect("/sandbox/checkout");
    }
  }
  return <main className="account-state-page"><section className="account-state-card"><span className="eyebrow">PRODUCT PREVIEW</span><h1>Marketplace features are not live.</h1><p>This deployment is not cleared to serve client or creator portals. Purchases, payouts, uploads, messaging, and calls are disabled until their services and launch approvals are complete.</p><Link className="button button-dark" href="/">Back to home</Link></section></main>;
}
