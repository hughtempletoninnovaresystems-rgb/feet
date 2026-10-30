"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { describePayoutState,formatPence } from "@/lib/creator-wallet";

type Payout={id:string;amount_pence:number;address:string;state:string;crypto_amount:string|null;txid:string|null;created_at?:string;updated_at?:string};
type Wallet={availablePence:number;earnedPence:number;paidPence:number;reservedPence:number;payouts:Payout[]};
function when(value?:string){const d=value?new Date(value):null;return d&&!Number.isNaN(d.getTime())?d.toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):"";}
export default function SandboxPayouts() {
  const [wallet,setWallet]=useState<Wallet|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [address,setAddress]=useState("btc-5592b1fdb13442a9984d98d42e7007ec");
  const [amount,setAmount]=useState("8.00");
  const requestKey=useRef<string|null>(null);
  const locked=useRef(false);
  const refresh=useCallback(async()=>{
    const r=await fetch("/api/payouts/sandbox",{cache:"no-store"});
    const data=await r.json();
    if (!r.ok) throw new Error(data.error??"Unable to load payouts.");
    setWallet(data);
    setError("");
  },[]);
  useEffect(()=>{
    let active=true;
    let timer:ReturnType<typeof setTimeout>;
    const tick=async()=>{
      try {if(active) await refresh();} catch(e){if(active)setError(e instanceof Error?e.message:"Refresh failed.");}
      finally {if(active)timer=setTimeout(tick,15_000);}
    };
    void tick();
    return()=>{active=false;clearTimeout(timer);};
  },[refresh]);
  async function act(path:string,body:object) {
    if (locked.current)return;
    locked.current=true;setBusy(true);setError("");
    try{
      const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error??"Payout action failed.");
      requestKey.current=null;
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Payout action failed.");}
    finally{locked.current=false;setBusy(false);}
  }
  function prepare(){
    if(!/^\d{1,4}\.\d{2}$/.test(amount)){setError("Enter a test GBP amount with two decimal places.");return;}
    const [pounds,pence]=amount.split(".");
    requestKey.current??=crypto.randomUUID();
    void act("/api/payouts/sandbox",{requestKey:requestKey.current,amountPence:Number(pounds)*100+Number(pence),address});
  }
  return <>
    <h1>Creator payout sandbox</h1>
    <p>Simulated earnings and test crypto only. No real creator earnings or production withdrawals.</p>
    <p>Fixture: £8 creator earnings from an illustrative £10 sale (80% share).</p>
    {error?<p role="alert">{error}{wallet?" Showing the last balances loaded; they may be out of date.":""}</p>:null}
    <h2>Wallet</h2>
    {wallet?<dl role="status" aria-live="polite">
      <dt>Available to pay out</dt><dd>{formatPence(wallet.availablePence)}</dd>
      <dt>Reserved for payouts in progress</dt><dd>{formatPence(wallet.reservedPence)}</dd>
      <dt>Paid out</dt><dd>{formatPence(wallet.paidPence)}</dd>
      <dt>Total test earnings</dt><dd>{formatPence(wallet.earnedPence)}</dd>
    </dl>:<p role="status">{error?"Wallet unavailable.":"Loading…"}</p>}
    {wallet&&wallet.reservedPence>0?<p>Reserved funds stay held until the provider confirms the outcome. Do not create a replacement payout.</p>:null}
    <label>Test amount in GBP <input value={amount} onChange={e=>{setAmount(e.target.value);requestKey.current=null;}} disabled={busy}/></label>
    <label>Recipient BTC address from ForumPay Sandbox Wallet <input value={address} onChange={e=>{setAddress(e.target.value);requestKey.current=null;}} disabled={busy}/></label>
    <p>Network fees are deducted from the payout (fixed_in). Review the crypto amount before confirmation.</p>
    <button className="button button-dark" disabled={busy||!wallet||wallet.availablePence<100} onClick={prepare}>Prepare test payout</button>
    <h2>Test payouts</h2>
    {wallet&&wallet.payouts.length===0?<p>No test payouts yet.</p>:null}
    <ul>{wallet?.payouts.map(p=>{const status=describePayoutState(p.state);return <li key={p.id}>
      {formatPence(p.amount_pence)} · <strong>{status.label}</strong> · {p.address}
      {p.created_at?<> · created {when(p.created_at)}</>:null}
      {p.updated_at&&p.updated_at!==p.created_at?<> · updated {when(p.updated_at)}</>:null}
      <p role={status.kind==="attention"?"alert":undefined}>{status.detail}</p>
      {p.crypto_amount?<p>{p.crypto_amount} BTC before network fee</p>:null}
      {p.state==="pending_confirmation"?<>
        <button disabled={busy} onClick={()=>void act("/api/payouts/sandbox/"+p.id,{action:"confirm"})}>Confirm test payout</button>
        <button disabled={busy} onClick={()=>void act("/api/payouts/sandbox/"+p.id,{action:"cancel"})}>Cancel test payout</button>
      </>:null}
      {p.txid?<p>Test transaction: {p.txid}{p.state==="paid"?"":" (sent, not yet confirmed in the blockchain)"}</p>:null}
    </li>;})}</ul>
  </>;
}
