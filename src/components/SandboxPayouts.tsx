"use client";
import { useCallback,useEffect,useRef,useState } from "react";

type Payout={id:string;amount_pence:number;address:string;state:string;crypto_amount:string|null;txid:string|null};
type Wallet={availablePence:number;earnedPence:number;payouts:Payout[]};
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
    <p role="status">Available test earnings: {wallet? "£"+(wallet.availablePence/100).toFixed(2):"Loading…"}</p>
    {error?<p role="alert">{error}</p>:null}
    <label>Test amount in GBP <input value={amount} onChange={e=>{setAmount(e.target.value);requestKey.current=null;}} disabled={busy}/></label>
    <label>Recipient BTC address from ForumPay Sandbox Wallet <input value={address} onChange={e=>{setAddress(e.target.value);requestKey.current=null;}} disabled={busy}/></label>
    <p>Network fees are deducted from the payout (fixed_in). Review the crypto amount before confirmation.</p>
    <button className="button button-dark" disabled={busy||!wallet||wallet.availablePence<100} onClick={prepare}>Prepare test payout</button>
    <h2>Test payouts</h2>
    <ul>{wallet?.payouts.map(p=><li key={p.id}>
      £{(p.amount_pence/100).toFixed(2)} · {p.state} · {p.address}
      {p.crypto_amount?<> · {p.crypto_amount} BTC before network fee</>:null}
      {p.state==="pending_confirmation"?<>
        <button disabled={busy} onClick={()=>void act("/api/payouts/sandbox/"+p.id,{action:"confirm"})}>Confirm test payout</button>
        <button disabled={busy} onClick={()=>void act("/api/payouts/sandbox/"+p.id,{action:"cancel"})}>Cancel test payout</button>
      </>:null}
      {p.state==="creating"||p.state==="review"||p.state==="confirming"||p.state==="cancelling"?<p>Reservation held while the outcome is reconciled. Do not create a replacement.</p>:null}
      {p.txid?<p>Test transaction: {p.txid}</p>:null}
    </li>)}</ul>
  </>;
}
