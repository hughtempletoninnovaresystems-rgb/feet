"use client";

import { useCallback, useEffect, useState } from "react";

type ProfileSettings = {
  displayName: string; handle: string; bio: string; location: string; callRate: number;
  defaultPhotoPrice: number; defaultVideoPrice: number; allowLikes: boolean; allowComments: boolean; showOnlineStatus: boolean;
};
type BlockedMember = { user_id: string; display_name: string; role: "client" | "model"; created_at: string };
const empty: ProfileSettings = { displayName: "", handle: "", bio: "", location: "", callRate: 18, defaultPhotoPrice: 12, defaultVideoPrice: 24, allowLikes: true, allowComments: true, showOnlineStatus: false };

export default function ConnectedSettings({ role }: { role: "client" | "model" }) {
  const [section, setSection] = useState("Profile");
  const [profile, setProfile] = useState<ProfileSettings>(empty);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<BlockedMember[]>([]);

  const load = useCallback(async () => {
    const response = await fetch("/api/account/profile", { cache: "no-store" });
    const data = await response.json() as { profile?: ProfileSettings; error?: string };
    if (!response.ok || !data.profile) throw new Error(data.error ?? "Profile settings are unavailable.");
    setProfile(data.profile);
  }, []);
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Profile settings are unavailable.")); }, [load]);
  useEffect(() => {
    if (section !== "Privacy & safety") return;
    fetch("/api/blocks", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { blocked?: BlockedMember[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Blocked members could not be loaded.");
      setBlocked(data.blocked ?? []);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Blocked members could not be loaded."));
  }, [section]);

  const save = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Profile settings could not be saved.");
      setNotice("Your profile settings have been saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Profile settings could not be saved."); }
    finally { setBusy(false); }
  };

  const update = <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => setProfile((current) => ({ ...current, [key]: value }));
  const unblock = async (member: BlockedMember) => {
    const response = await fetch(`/api/blocks/${member.user_id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocked: false }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setError(data.error ?? "Member could not be unblocked."); return; }
    setBlocked((current) => current.filter((item) => item.user_id !== member.user_id));
  };
  return <div className="connected-settings"><header><span className="eyebrow">YOUR ACCOUNT</span><h1>Settings</h1><p>Profile, creator pricing, and privacy choices save to your account.</p></header>
    {(error || notice) && <p role={error ? "alert" : "status"} className={error ? "creator-media-error" : "creator-media-notice"}>{error || notice}</p>}
    <div className="connected-settings-layout"><nav className="connected-settings-nav">{["Profile", "Pricing", "Privacy & safety"].map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>{item}</button>)}</nav>
      <section className="connected-settings-panel"><div className="connected-settings-panel-head"><div><h2>{section}</h2><p>{section === "Pricing" ? "These are display prices only; checkout and paid calls remain disabled." : "Changes apply to your verified account profile."}</p></div><button className="button button-dark button-compact" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
        {section === "Profile" && <div className="connected-settings-fields"><label>Display name<input value={profile.displayName} maxLength={80} onChange={(event) => update("displayName", event.target.value)}/></label><label>Username<input value={profile.handle} maxLength={50} onChange={(event) => update("handle", event.target.value)}/></label><label>Location<input value={profile.location} maxLength={120} onChange={(event) => update("location", event.target.value)}/></label><label className="wide">About you<textarea value={profile.bio} maxLength={2000} onChange={(event) => update("bio", event.target.value)}/></label></div>}
        {section === "Pricing" && role === "model" && <div className="connected-settings-fields"><label>Private call rate (tokens/min)<input type="number" min="1" max="100000" value={profile.callRate} onChange={(event) => update("callRate", Number(event.target.value))}/></label><label>Default photo price (tokens)<input type="number" min="1" max="100000" value={profile.defaultPhotoPrice} onChange={(event) => update("defaultPhotoPrice", Number(event.target.value))}/></label><label>Default video price (tokens)<input type="number" min="1" max="100000" value={profile.defaultVideoPrice} onChange={(event) => update("defaultVideoPrice", Number(event.target.value))}/></label></div>}
        {section === "Pricing" && role === "client" && <p className="moderation-empty">Creator pricing is not part of a client account.</p>}
        {section === "Privacy & safety" && <div className="connected-settings-options"><label><span><b>Allow likes</b><small>Members can like your profile.</small></span><input type="checkbox" checked={profile.allowLikes} onChange={(event) => update("allowLikes", event.target.checked)}/></label><label><span><b>Allow comments</b><small>Comments are held for moderator review before publication.</small></span><input type="checkbox" checked={profile.allowComments} onChange={(event) => update("allowComments", event.target.checked)}/></label><label><span><b>Show online status</b><small>Presence is not connected yet, so your status is currently hidden.</small></span><input type="checkbox" checked={profile.showOnlineStatus} onChange={(event) => update("showOnlineStatus", event.target.checked)}/></label><h3>Blocked members</h3>{blocked.map((member) => <div className="blocked-member-row" key={member.user_id}><span>{member.display_name} · {member.role === "model" ? "Creator" : "Client"}</span><button className="button button-outline button-compact" onClick={() => void unblock(member)}>Unblock</button></div>)}{blocked.length === 0 && <p>No members are blocked.</p>}<p>Account closure and data export will be available after those service workflows are implemented. Contact the operator for requests.</p></div>}
      </section></div>
  </div>;
}
