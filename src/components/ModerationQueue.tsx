"use client";

import { useCallback, useEffect, useState } from "react";

type Asset = { id: string; display_name: string; media_type: string; mime_type: string; size_bytes: number; created_at: string; media_title: string | null; reviewUrl: string | null };
type Comment = { id: string; display_name: string; target_name: string; body: string; created_at: string };
type Report = { id: string; reporter_name: string | null; reported_name: string | null; target_kind: string; target_id: string | null; reason: string; details: string; target_context: string | null; created_at: string };
type Queue = { media: Asset[]; comments: Comment[]; reports: Report[] };

export default function ModerationQueue() {
  const [queue, setQueue] = useState<Queue>({ media: [], comments: [], reports: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/moderation", { cache: "no-store" });
    const data = await response.json() as Queue & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Moderation queue is unavailable.");
    setQueue(data);
  }, []);

  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Moderation queue is unavailable.")); }, [load]);

  const decide = async (input: Record<string, string>) => {
    setBusy(input.id);
    setError("");
    try {
      const response = await fetch("/api/admin/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Decision could not be saved.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Decision could not be saved.");
    } finally {
      setBusy("");
    }
  };

  return <main className="moderation-page"><header><div><span className="eyebrow">OPERATIONS</span><h1>Moderation queue</h1><p>Review each item, record decisions, and keep unresolved reports visible to the team.</p></div><button className="button button-outline" onClick={() => void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Queue refresh failed."))}>Refresh</button></header>
    {error && <p role="alert" className="moderation-error">{error}</p>}
    <section><h2>Uploaded media ({queue.media.length})</h2>{queue.media.map((asset) => <article className="moderation-card" key={asset.id}><div className="moderation-preview">{asset.reviewUrl ? (asset.media_type === "video" ? <video src={asset.reviewUrl} controls preload="metadata"/> : <img src={asset.reviewUrl} alt="Submitted creator media"/>) : <p>Private preview unavailable</p>}</div><div className="moderation-copy"><b>{asset.media_title || "Untitled creator media"}</b><p>Creator: {asset.display_name} · {asset.mime_type} · {Math.ceil(asset.size_bytes / 1024 / 1024)} MB</p><small>Uploaded {new Date(asset.created_at).toLocaleString()}</small><div className="moderation-actions"><button disabled={busy === asset.id || !asset.reviewUrl} onClick={() => void decide({ kind: "asset", id: asset.id, decision: "approve" })}>Approve</button><button disabled={busy === asset.id} onClick={() => void decide({ kind: "asset", id: asset.id, decision: "reject", notes: "Rejected during manual content review." })}>Reject</button></div></div></article>)}{queue.media.length === 0 && <p className="moderation-empty">No media awaits review.</p>}</section>
    <section><h2>Comments awaiting review ({queue.comments.length})</h2>{queue.comments.map((item) => <article className="moderation-card moderation-text-card" key={item.id}><div><p>{item.body}</p><small>{item.display_name} on {item.target_name} · {new Date(item.created_at).toLocaleString()}</small><div className="moderation-actions"><button disabled={busy === item.id} onClick={() => void decide({ kind: "comment", id: item.id, decision: "approve" })}>Approve</button><button disabled={busy === item.id} onClick={() => void decide({ kind: "comment", id: item.id, decision: "reject", notes: "Rejected during manual comment review." })}>Remove</button></div></div></article>)}{queue.comments.length === 0 && <p className="moderation-empty">No comments await review.</p>}</section>
    <section><h2>Reports ({queue.reports.length})</h2>{queue.reports.map((item) => <article className="moderation-card moderation-text-card" key={item.id}><div><b>{item.target_kind} report: {item.reason}</b>{item.target_context && <blockquote>{item.target_context}</blockquote>}<p>{item.details || "No further details provided."}</p><small>Reporter: {item.reporter_name || "Account closed"} · Reported: {item.reported_name || "Unknown"} · {new Date(item.created_at).toLocaleString()}</small><div className="moderation-actions"><button disabled={busy === item.id} onClick={() => void decide({ kind: "report", id: item.id, decision: "actioned", accountAction: "restrict", notes: "Report actioned after review; account restricted." })}>Action + restrict</button><button disabled={busy === item.id} onClick={() => void decide({ kind: "report", id: item.id, decision: "actioned", accountAction: "none", notes: "Report actioned; no account restriction." })}>Action</button><button disabled={busy === item.id} onClick={() => void decide({ kind: "report", id: item.id, decision: "dismissed", accountAction: "none", notes: "Report reviewed and dismissed." })}>Dismiss</button></div></div></article>)}{queue.reports.length === 0 && <p className="moderation-empty">No reports await review.</p>}</section>
  </main>;
}
