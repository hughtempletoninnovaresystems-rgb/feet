"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Clock3, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { describePayoutState, formatPence } from "@/lib/creator-wallet";

type Payout = {
  id: string;
  amount_pence: number;
  address: string;
  state: string;
  crypto_amount: string | null;
  txid: string | null;
  created_at?: string;
  updated_at?: string;
};

type Wallet = {
  availablePence: number;
  earnedPence: number;
  paidPence: number;
  reservedPence: number;
  payouts: Payout[];
};

type Confirmation = { payoutId: string; action: "confirm" | "cancel" } | null;

function formatDate(value?: string) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : null;
}

function shortAddress(address: string) {
  return address.length > 18 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address;
}

export default function SandboxPayouts({ embedded = false }: { embedded?: boolean }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestStarted, setRequestStarted] = useState(false);
  const [walletStale, setWalletStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [address, setAddress] = useState("btc-5592b1fdb13442a9984d98d42e7007ec");
  const [amount, setAmount] = useState("8.00");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const requestKey = useRef<string | null>(null);
  const locked = useRef(false);

  const loadWallet = useCallback(async (signal?: AbortSignal): Promise<Wallet> => {
    const response = await fetch("/api/payouts/sandbox", { cache: "no-store", signal });
    const data = await response.json() as Wallet & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to load the creator wallet.");
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void loadWallet(controller.signal).then((data) => {
      if (!active) return;
      setWallet(data);
      setLastUpdated(new Date().toISOString());
      setWalletStale(false);
      setError("");
    }).catch((reason: unknown) => {
      if (active && !controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "Unable to load the creator wallet.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [loadWallet]);

  const refreshWallet = async () => {
    if (busy || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const data = await loadWallet();
      setWallet(data);
      setLastUpdated(new Date().toISOString());
      setWalletStale(false);
    } catch (reason) {
      if (wallet) setWalletStale(true);
      setError(reason instanceof Error ? reason.message : "Unable to refresh the creator wallet.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  async function act(path: string, body: object, isPreparation = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    let outcomeUnknown = true;
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        outcomeUnknown = response.status >= 500;
        if (isPreparation && response.status === 400) {
          requestKey.current = null;
          setRequestStarted(false);
        }
        throw new Error(data.error ?? "The payout action could not be completed.");
      }
      outcomeUnknown = false;
      if (isPreparation) {
        requestKey.current = null;
        setRequestStarted(false);
      }
      setConfirmation(null);
      try {
        const updated = await loadWallet();
        setWallet(updated);
        setLastUpdated(new Date().toISOString());
        setWalletStale(false);
      } catch {
        setWalletStale(true);
        setError("Payout action completed, but the wallet could not refresh. Use Refresh to check the latest status.");
      }
    } catch (reason) {
      if (outcomeUnknown) setWalletStale(true);
      setError(reason instanceof Error ? reason.message : "The payout action could not be completed.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function preparePayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || locked.current) return;
    if (!/^\d{1,4}\.\d{2}$/.test(amount)) {
      setError("Enter a GBP amount with exactly two decimal places.");
      return;
    }
    const [pounds, pence] = amount.split(".");
    const amountPence = Number(pounds) * 100 + Number(pence);
    if (amountPence < 100 || amountPence > 100_000 || amountPence > wallet.availablePence) {
      setError(`Enter an amount between £1.00 and ${formatPence(Math.min(wallet.availablePence, 100_000))}.`);
      return;
    }
    if (!/^btc-[a-f0-9]{32}$/.test(address)) {
      setError("Enter a simulated BTC address from ForumPay's Sandbox Wallet.");
      return;
    }
    requestKey.current ??= crypto.randomUUID();
    setRequestStarted(true);
    void act("/api/payouts/sandbox", { requestKey: requestKey.current, amountPence, address }, true);
  }

  function confirmAction() {
    if (!confirmation) return;
    const { payoutId, action } = confirmation;
    void act(`/api/payouts/sandbox/${payoutId}`, { action });
  }

  const payoutAvailable = wallet !== null && wallet.availablePence >= 100;
  const rootClass = embedded ? "sandbox-wallet sandbox-wallet-embedded" : "sandbox-wallet";

  return <section className={rootClass} aria-labelledby="creator-wallet-title">
    <header className="sandbox-wallet-heading">
      <div>
        <span className="eyebrow">CREATOR WALLET · PREVIEW</span>
        <h1 id="creator-wallet-title">{embedded ? "Earnings" : "Creator payout sandbox"}</h1>
        <p>Simulated earnings and test crypto only. This wallet cannot withdraw real creator earnings.</p>
      </div>
      <button className="button button-outline sandbox-wallet-refresh" type="button" onClick={() => void refreshWallet()} disabled={loading || refreshing || busy}>
        <RefreshCw size={15} className={refreshing ? "sandbox-spinning" : ""} />
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </header>

    <div className="sandbox-wallet-banner" role="note">
      <ShieldCheck size={18} />
      <div>
        <b>Isolated ForumPay sandbox</b>
        <p>The £8 starting balance is synthetic test earnings illustrating an 80% share of an example £10 sale. It is not revenue or a promise of creator payout terms.</p>
      </div>
    </div>

    {error && <p className="sandbox-wallet-error" role="alert">
      {error}
      {wallet && walletStale && <span> Showing the last successfully loaded balances{lastUpdated ? ` from ${formatDate(lastUpdated)}` : ""}.</span>}
    </p>}

    <section className="sandbox-wallet-hero" aria-label="Available test earnings">
      <div>
        <span className="sandbox-wallet-label">AVAILABLE FOR A TEST PAYOUT</span>
        <strong>{wallet ? formatPence(wallet.availablePence) : loading ? "Loading…" : "Unavailable"}</strong>
        <p>Only isolated synthetic earnings. No real money is held here.</p>
      </div>
      <span className="sandbox-wallet-hero-mark" aria-hidden="true">£</span>
    </section>

    <div className="sandbox-wallet-stats" aria-label="Wallet balances" aria-live="polite">
      <article><span>Total synthetic earnings</span><strong>{wallet ? formatPence(wallet.earnedPence) : "—"}</strong></article>
      <article><span>Reserved for payouts</span><strong>{wallet ? formatPence(wallet.reservedPence) : "—"}</strong></article>
      <article><span>Confirmed as paid</span><strong>{wallet ? formatPence(wallet.paidPence) : "—"}</strong></article>
    </div>

    {wallet && wallet.reservedPence > 0 && <div className="sandbox-wallet-hold" role="status">
      <LockKeyhole size={17} />
      <p><b>{formatPence(wallet.reservedPence)} is reserved.</b> Funds stay unavailable until ForumPay verifies the payout outcome. Don’t create a replacement payout.</p>
    </div>}

    <section className="sandbox-wallet-panel" aria-labelledby="test-payout-title">
      <div className="sandbox-wallet-panel-heading">
        <div>
          <span className="eyebrow">TEST ONLY</span>
          <h2 id="test-payout-title">Prepare a payout</h2>
          <p>Preparing does not send funds. Review the provider’s crypto quote before you confirm.</p>
        </div>
      </div>
      <form className="sandbox-wallet-form" onSubmit={preparePayout}>
        <label>
          Test amount (GBP)
          <span className="sandbox-wallet-input-wrap"><span>£</span><input inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} aria-describedby="sandbox-amount-help" disabled={busy || requestStarted} /></span>
          <small id="sandbox-amount-help">Minimum £1.00 · Available: {wallet ? formatPence(wallet.availablePence) : "loading"}</small>
        </label>
        <label>
          ForumPay sandbox BTC address
          <input autoComplete="off" value={address} onChange={(event) => setAddress(event.target.value)} aria-describedby="sandbox-address-help" disabled={busy || requestStarted} />
          <small id="sandbox-address-help">Use a simulated address from the ForumPay Sandbox Wallet.</small>
        </label>
        <div className="sandbox-wallet-form-actions">
          <button className="button button-dark" type="submit" disabled={busy || loading || walletStale || !payoutAvailable}>
            {busy ? "Working…" : requestStarted ? "Retry same request" : "Prepare test payout"}
            {!busy && <ArrowRight size={15} />}
          </button>
          <span><LockKeyhole size={13} /> Network fees use the sandbox fixed-in setting.</span>
        </div>
      </form>
      {!loading && walletStale && <p className="sandbox-wallet-no-funds">Refresh the wallet before preparing another payout.</p>}
      {!loading && wallet && !walletStale && !payoutAvailable && <p className="sandbox-wallet-no-funds">There is no available test balance to prepare another payout.</p>}
    </section>

    <section className="sandbox-wallet-history" aria-labelledby="payout-history-title">
      <div className="sandbox-wallet-history-heading">
        <div><span className="eyebrow">ACTIVITY</span><h2 id="payout-history-title">Payout history</h2></div>
        {lastUpdated && <span><Clock3 size={13} /> Updated {formatDate(lastUpdated)}</span>}
      </div>
      {loading && !wallet && <p className="sandbox-wallet-empty" role="status">Loading payout history…</p>}
      {!loading && wallet?.payouts.length === 0 && <p className="sandbox-wallet-empty">No test payouts yet. Any activity will appear here.</p>}
      <div className="sandbox-payout-list">
        {wallet?.payouts.map((payout) => {
          const status = describePayoutState(payout.state);
          const payoutConfirmation = confirmation?.payoutId === payout.id ? confirmation.action : null;
          return <article className="sandbox-payout-card" key={payout.id}>
            <div className="sandbox-payout-card-top">
              <div><strong>{formatPence(payout.amount_pence)}</strong><small>{formatDate(payout.created_at) ?? "Date unavailable"}</small></div>
              <span className={`sandbox-payout-status ${status.kind}`}>{status.label}</span>
            </div>
            <p className={`sandbox-payout-detail ${status.kind === "attention" ? "attention" : ""}`} role={status.kind === "attention" ? "alert" : undefined}>{status.detail}</p>
            <dl className="sandbox-payout-metadata">
              <div><dt>Recipient</dt><dd title={payout.address}>{shortAddress(payout.address)}</dd></div>
              {payout.crypto_amount && <div><dt>Provider quote</dt><dd>{payout.crypto_amount} BTC <small>before network fee</small></dd></div>}
              {payout.updated_at && payout.updated_at !== payout.created_at && <div><dt>Last updated</dt><dd>{formatDate(payout.updated_at)}</dd></div>}
            </dl>
            {payout.txid && <p className="sandbox-payout-transaction">Transaction ID: <code>{payout.txid}</code>{payout.state !== "paid" && <span>Sent; not yet confirmed in the blockchain.</span>}</p>}
            {payout.state === "pending_confirmation" && <div className="sandbox-payout-actions">
              {!payoutConfirmation && <>
                <button className="button button-dark button-compact" type="button" disabled={busy} onClick={() => setConfirmation({ payoutId: payout.id, action: "confirm" })}>Review payout</button>
                <button className="button button-outline button-compact" type="button" disabled={busy} onClick={() => setConfirmation({ payoutId: payout.id, action: "cancel" })}>Cancel request</button>
              </>}
              {payoutConfirmation && <div className="sandbox-payout-confirmation" role="group" aria-label={payoutConfirmation === "confirm" ? "Confirm test payout" : "Cancel test payout"}>
                <p>{payoutConfirmation === "confirm"
                  ? `Confirm sending ${payout.crypto_amount ?? "the quoted amount"} BTC to ${shortAddress(payout.address)}. Funds stay reserved until blockchain confirmation.`
                  : `Cancel the ${formatPence(payout.amount_pence)} test payout? The reservation stays in place until ForumPay confirms cancellation.`}</p>
                <button className="button button-dark button-compact" type="button" disabled={busy} onClick={confirmAction}>{busy ? "Working…" : payoutConfirmation === "confirm" ? "Confirm test payout" : "Confirm cancellation"}</button>
                <button className="button button-outline button-compact" type="button" disabled={busy} onClick={() => setConfirmation(null)}>Go back</button>
              </div>}
            </div>}
          </article>;
        })}
      </div>
    </section>

    <p className="sandbox-wallet-footer"><LockKeyhole size={13} /> Preview simulation only. Test balances cannot purchase content or be withdrawn as real funds.</p>
  </section>;
}
