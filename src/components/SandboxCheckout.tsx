"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Clock3, ExternalLink, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";

type Order = {
  id: string;
  tokens: number;
  amount_pence: number;
  state: string;
  checkout_url: string | null;
  created_at?: string;
};
type Wallet = { sandboxBalance: string; packages: { id: string; tokens: number; pence: number }[]; orders: Order[] };
type CheckoutLink = { orderId: string; url: string };

function formatPrice(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function formatDate(value?: string) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : null;
}

export default function SandboxCheckout({ embedded = false }: { embedded?: boolean }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [latestCheckout, setLatestCheckout] = useState<CheckoutLink | null>(null);
  const requestKey = useRef<string | null>(null);
  const locked = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/payments/checkout", { cache: "no-store", signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to load test wallet.");
    setWallet(data);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch("/api/payments/checkout", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load test wallet.");
        if (!active) return;
        setWallet(data);
        const pending = (data.orders as Order[]).filter(order => order.state === "pending").slice(0, 3);
        for (const order of pending) {
          const status = await fetch("/api/payments/orders/" + order.id, { cache: "no-store", signal: controller.signal });
          if (!status.ok) throw new Error("Payment verification is temporarily unavailable.");
        }
        if (active) setError("");
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to refresh.");
      } finally {
        if (active) timer = setTimeout(poll, 10_000);
      }
    };
    void poll();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, []);

  async function checkout(packageId: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    requestKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, requestKey: requestKey.current }),
      });
      const data = await response.json() as { orderId?: string; checkoutUrl?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to create checkout.");
      if (!data.orderId || !data.checkoutUrl) throw new Error("ForumPay returned an incomplete checkout link.");
      setLatestCheckout({ orderId: data.orderId, url: data.checkoutUrl });
      requestKey.current = null;
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create checkout.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return <section className={`sandbox-checkout${embedded ? " sandbox-checkout-embedded" : ""}`} aria-labelledby="sandbox-checkout-title">
    {!embedded && <header className="sandbox-checkout-header">
      <Link className="brand sandbox-checkout-brand" href="/" aria-label="My Feet Show home">
        <span className="brand-mark" aria-hidden="true">f</span>
        <span>my feet <b>show</b></span>
      </Link>
      <span className="sandbox-checkout-environment"><span /> Sandbox environment</span>
    </header>}

    <div className="sandbox-checkout-main">
      <div className="sandbox-checkout-intro">
        <span className="eyebrow">TEST PURCHASE · FORUMPAY</span>
        <h1 id="sandbox-checkout-title">Your next favourite, <em>on us to test.</em></h1>
        <p>Try the checkout using a simulated payment. Nothing here is real money, and test tokens stay inside this sandbox.</p>
        <div className="sandbox-checkout-trust">
          <span><ShieldCheck size={16} /> Isolated test balance</span>
          <span><LockKeyhole size={15} /> Secure hosted payment</span>
        </div>
      </div>

      <div className="sandbox-checkout-column">
        <article className="sandbox-checkout-card">
          <div className="sandbox-checkout-card-heading">
            <div className="sandbox-checkout-package-icon"><WalletCards size={21} /></div>
            <span className="sandbox-checkout-tag">TEST PACKAGE</span>
          </div>
          <p className="sandbox-checkout-package-name">Token top-up</p>
          <div className="sandbox-checkout-price">
            <strong>{wallet?.packages[0] ? formatPrice(wallet.packages[0].pence) : "£10.00"}</strong>
            <span>one-time test payment</span>
          </div>
          <div className="sandbox-checkout-token-row">
            <span>Sandbox tokens</span>
            <strong>{wallet?.packages[0]?.tokens ?? 100}</strong>
          </div>
          <button
            type="button"
            className="button button-dark sandbox-checkout-submit"
            disabled={busy || !wallet?.packages.length}
            onClick={() => wallet?.packages[0] && void checkout(wallet.packages[0].id)}
          >
            {busy ? "Preparing secure checkout…" : "Continue to payment"}
            {!busy && <ArrowRight size={17} />}
          </button>
          <p className="sandbox-checkout-card-note"><LockKeyhole size={13} /> You’ll review the test payment with ForumPay next.</p>
        </article>

        <div className="sandbox-checkout-balance">
          <div className="sandbox-checkout-balance-icon"><WalletCards size={18} /></div>
          <div><span>YOUR TEST BALANCE</span><strong>{wallet?.sandboxBalance ?? "Loading…"} tokens</strong></div>
        </div>
      </div>
    </div>

    <div className="sandbox-checkout-notice" role="note">
      <ShieldCheck size={19} />
      <p><strong>Sandbox only.</strong> Tokens cannot buy content, fund calls, or be withdrawn, and do not represent money or a real purchase.</p>
    </div>

    {error && <p className="sandbox-checkout-error" role="alert">{error}</p>}

    {latestCheckout && <div className="sandbox-checkout-next" role="status">
      <div className="sandbox-checkout-next-icon"><Check size={18} /></div>
      <div>
        <strong>Your test payment is ready</strong>
        <p>Continue to ForumPay’s hosted sandbox payment page to complete the test.</p>
      </div>
      <a className="button button-dark" href={latestCheckout.url} target="_blank" rel="noopener noreferrer">
        Open payment <ArrowUpRight size={16} />
      </a>
    </div>}

    <section className="sandbox-checkout-orders" aria-labelledby="sandbox-checkout-orders-title">
      <div className="sandbox-checkout-orders-heading">
        <div><span className="eyebrow">YOUR ACTIVITY</span><h2 id="sandbox-checkout-orders-title">Recent test orders</h2></div>
        <span><Clock3 size={14} /> Updates automatically</span>
      </div>
      {!wallet?.orders.length && <p className="sandbox-checkout-empty">Your test orders will appear here.</p>}
      {!!wallet?.orders.length && <ul>
        {wallet.orders.map(order => <li key={order.id}>
          <span className="sandbox-checkout-order-icon"><WalletCards size={16} /></span>
          <span className="sandbox-checkout-order-details">
            <strong>{order.tokens} test tokens</strong>
            <small>{formatDate(order.created_at) ?? "Recent order"}</small>
          </span>
          <span className={`sandbox-checkout-order-state ${order.state === "paid" ? "complete" : ""}`}>{order.state}</span>
          <strong className="sandbox-checkout-order-price">{formatPrice(order.amount_pence)}</strong>
          {order.checkout_url && order.state === "pending"
            ? <a className="sandbox-checkout-order-link" href={order.checkout_url} target="_blank" rel="noopener noreferrer" aria-label="Open ForumPay test payment"><ExternalLink size={16} /></a>
            : null}
          {order.state === "creating" && <small className="sandbox-checkout-order-message">Payment setup is incomplete; contact support before trying again.</small>}
          {order.state === "review" && <small className="sandbox-checkout-order-message">Payment needs review; no test tokens credited.</small>}
        </li>)}
      </ul>}
    </section>
    <footer className="sandbox-checkout-footer">My Feet Show · ForumPay sandbox · No real funds are used</footer>
  </section>;
}
