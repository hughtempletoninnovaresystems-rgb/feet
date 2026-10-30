"use client";

import { useCallback, useEffect, useState } from "react";

type Media = { id: string; title: string; description: string; media_type: "photo_set" | "video"; price_tokens: number; status: string; created_at: string; assets: number; approved_assets: number };

export default function CreatorMedia() {
  const [media, setMedia] = useState<Media[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("12");
  const [mediaType, setMediaType] = useState<"photo_set" | "video">("photo_set");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/model/media", { cache: "no-store" });
    const data = await response.json() as { media?: Media[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Creator media is unavailable.");
    return data.media ?? [];
  }, []);

  const handleLoadError = useCallback((reason: unknown) => setError(reason instanceof Error ? reason.message : "Creator media is unavailable."), []);
  useEffect(() => { void load().then(setMedia).catch(handleLoadError); }, [handleLoadError, load]);

  const createUpload = async (mediaId: string, file: File) => {
    const presignResponse = await fetch(`/api/model/media/${mediaId}/assets`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
    });
    const presign = await presignResponse.json() as { assetId?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string };
    if (!presignResponse.ok || !presign.assetId || !presign.uploadUrl) throw new Error(presign.error ?? `Could not prepare ${file.name} for upload.`);
    const uploadResponse = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.headers, body: file });
    if (!uploadResponse.ok) throw new Error(`Private storage did not accept ${file.name}. Check the bucket CORS setup.`);
    const completeResponse = await fetch(`/api/model/media/${mediaId}/assets/${presign.assetId}/complete`, { method: "POST" });
    const complete = await completeResponse.json().catch(() => ({})) as { error?: string };
    if (!completeResponse.ok) throw new Error(complete.error ?? `Could not confirm ${file.name}.`);
  };

  const saveDraft = async () => {
    setBusy(true); setNotice(""); setError("");
    try {
      if (!title.trim()) throw new Error("Add a title first.");
      if (files.length === 0) throw new Error("Choose at least one file.");
      if (files.some((file) => file.size > 100 * 1024 * 1024)) throw new Error("Each file must be 100 MB or smaller.");
      const response = await fetch("/api/model/media", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, mediaType, priceTokens: Number(price) }),
      });
      const data = await response.json() as { mediaId?: string; error?: string };
      if (!response.ok || !data.mediaId) throw new Error(data.error ?? "Could not save this media item.");
      for (const file of files) await createUpload(data.mediaId, file);
      setTitle(""); setDescription(""); setFiles([]);
      setNotice("Files uploaded to private storage. They will stay hidden until moderation approves them.");
      setMedia(await load());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload could not be completed.");
    } finally { setBusy(false); }
  };

  const publish = async (item: Media) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/model/media/${item.id}/publish`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Media could not be published.");
      setNotice("Your approved media is published.");
      setMedia(await load());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Media could not be published."); }
    finally { setBusy(false); }
  };

  return <div className="creator-media-connected"><header><div><span className="eyebrow">YOUR WORK, YOUR TERMS</span><h1>My media</h1><p>Uploads stay private until each file passes moderator review.</p></div></header>
    {(notice || error) && <p className={error ? "creator-media-error" : "creator-media-notice"} role={error ? "alert" : "status"}>{error || notice}</p>}
    <section className="creator-media-form"><h2>Add media</h2><div className="creator-media-fields"><label>Title<input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="Give it a name"/></label><label>Price in tokens<input type="number" min="1" max="1000000" value={price} onChange={(event) => setPrice(event.target.value)}/></label><label>Format<select value={mediaType} onChange={(event) => setMediaType(event.target.value as "photo_set" | "video")}><option value="photo_set">Photo set</option><option value="video">Video</option></select></label><label className="creator-media-description">Description<textarea value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="Optional details"/></label><label className="creator-media-files">Files<input type="file" multiple={mediaType === "photo_set"} accept={mediaType === "video" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp,image/avif"} onChange={(event) => setFiles(Array.from(event.target.files ?? []))}/><small>JPEG, PNG, WebP, AVIF, MP4, or WebM. Up to 100 MB per file.</small></label></div><button className="button button-dark" onClick={() => void saveDraft()} disabled={busy}>{busy ? "Working…" : "Save draft and upload"}</button></section>
    <section className="creator-media-list"><h2>Your media ({media.length})</h2>{media.map((item) => <article className="creator-media-item" key={item.id}><div><b>{item.title}</b><p>{item.media_type === "video" ? "Video" : "Photo set"} · {item.price_tokens.toLocaleString()} tokens · {item.assets} file(s)</p><small>{item.status === "published" ? "Published" : item.assets === 0 ? "Draft · add files" : `${item.approved_assets}/${item.assets} approved · awaiting review`}</small></div>{item.status !== "published" && <button className="button button-outline button-compact" disabled={busy || item.assets === 0 || item.approved_assets !== item.assets} onClick={() => void publish(item)}>Publish</button>}</article>)}{media.length === 0 && <p className="moderation-empty">No media yet.</p>}</section>
  </div>;
}
