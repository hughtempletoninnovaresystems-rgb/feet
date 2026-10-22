import Link from "next/link";

export default function PreviewOnly() {
  return <main className="account-state-page"><section className="account-state-card"><span className="eyebrow">PRODUCT PREVIEW</span><h1>Marketplace features are not live.</h1><p>This deployment is not cleared to serve client or creator portals. Purchases, payouts, uploads, messaging, and calls are disabled until their services and launch approvals are complete.</p><Link className="button button-dark" href="/">Back to home</Link></section></main>;
}
