"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Order = { id: string; tokens: number; amount_pence: number; state: string; checkout_url: string | null };
type Wallet = { sandboxBalance: string; packages: { id: string; tokens: number; pence: number }[]; orders: Order[] };

export default function SandboxCheckout() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestKey = useRef<string | null>(null);
  const locked = useRef(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/payments/checkout", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to load test wallet.");
    setWallet(data);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    // Poll sequentially so slow provider responses never overlap.
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch("/api/payments/checkout", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load test wallet.");
        if (!active) return;
        setWallet(data);
        const pending = (data.orders as Order[]).filter(o => o.state === "pending").slice(0, 3);
        for (const order of pending) {
          const status = await fetch("/api/payments/orders/" + order.id, { cache: "no-store", signal: controller.signal });
          if (!status.ok) throw new Error("Payment verification is temporarily unavailable.");
        }
        if (active) setError("");
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Unable to refresh.");
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, requestKey: requestKey.current }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to create checkout.");
      // Preserve the local page and status polling while the hosted payment opens.
      await load();
      requestKey.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create checkout.");
    } finally { locked.current = false; setBusy(false); }
  }

  return <>
    <h1>ForumPay sandbox checkout</h1>
    <p>Test payments only. Test tokens cannot buy content, fund calls, or be withdrawn.</p>
    <p role="status">Test balance: {wallet?.sandboxBalance ?? "Loading…"} tokens</p>
    {error ? <p role="alert">{error}</p> : null}
    {wallet?.packages.map(pack => <button key={pack.id} className="button button-dark" disabled={busy}
      onClick={() => void checkout(pack.id)}>
      {busy ? "Creating checkout…" : `Test £${(pack.pence / 100).toFixed(2)} for ${pack.tokens} tokens`}
    </button>)}
    <h2>Recent test orders</h2>
    {wallet?.orders.length === 0 ? <p>No test orders yet.</p> : null}
    <ul>{wallet?.orders.map(order => <li key={order.id}>
      £{(order.amount_pence / 100).toFixed(2)} · {order.tokens} test tokens · {order.state}
      {order.checkout_url && order.state === "pending" ?
        <> · <a href={order.checkout_url} target="_blank" rel="noopener noreferrer">Open ForumPay test payment</a></> : null}
      {order.state === "creating" ? " — Payment setup is incomplete; contact support before trying again." : null}
      {order.state === "review" ? " — Payment needs review; no test tokens credited." : null}
    </li>)}</ul>
  </>;
}
