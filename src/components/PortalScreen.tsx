"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Bell, Check, ChevronDown, Compass, FileImage, Heart, Home, LockKeyhole, LogOut, MessageCircle, Plus, Search, Settings, ShieldAlert, ShieldCheck, Sparkles, Video, Wallet, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import ConnectedMessages from "@/components/ConnectedMessages";
import ConnectedSettings from "@/components/ConnectedSettings";
import CreatorMedia from "@/components/CreatorMedia";
import SandboxPayouts from "@/components/SandboxPayouts";

type Role = "client" | "model";
type Section = "home" | "content" | "media" | "messages" | "broadcasts" | "settings" | "wallet";
type Creator = { id: string; name: string; handle: string; slug: string; location: string; rate: number; likes: number; liked: boolean; online: boolean; avatarUrl: string | null; categories: string[] };

const iconFor: Record<string, ReactNode> = {
  home: <Home size={17} />, explore: <Compass size={17} />, content: <FileImage size={17} />, media: <FileImage size={17} />, messages: <MessageCircle size={17} />, broadcasts: <Video size={17} />, wallet: <Wallet size={17} />, settings: <Settings size={17} />,
};

export default function PortalScreen({ role, section, sandboxPayoutsEnabled = false }: { role: Role; section: Section; sandboxPayoutsEnabled?: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [creatorsLoaded, setCreatorsLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [accountName, setAccountName] = useState("");
  const isModel = role === "model";
  const creatorLoading = !isModel && section === "home" && !creatorsLoaded;

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const account = await response.json() as { displayName?: string };
      if (active && account.displayName) setAccountName(account.displayName);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (isModel || section !== "home") return;
    let active = true;
    fetch("/api/creators", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Creator discovery is unavailable.");
      const result = await response.json() as { creators?: Creator[] };
      if (active) setCreators(result.creators ?? []);
    }).catch(() => { if (active) setCreators([]); }).finally(() => { if (active) setCreatorsLoaded(true); });
    return () => { active = false; };
  }, [isModel, section]);

  const fallbackName = isModel ? "Creator" : "Member";
  const names = { role: isModel ? "Creator" : "Client", first: accountName || fallbackName };
  const nav: { label: string; route: string; key: string; group?: string }[] = isModel
    ? [{ label: "Home", route: "/model", key: "home", group: "YOUR SPACE" }, { label: "My media", route: "/model/media", key: "media" }, { label: "Messages", route: "/model/messages", key: "messages", group: "CONNECT" }, { label: "Broadcasts", route: "/model/broadcasts", key: "broadcasts" }, { label: "Wallet", route: "/model/wallet", key: "wallet", group: "ACCOUNT" }, { label: "Settings", route: "/model/settings", key: "settings" }]
    : [{ label: "Home", route: "/client", key: "home", group: "YOUR SPACE" }, { label: "My content", route: "/client/content", key: "content" }, { label: "Messages", route: "/client/messages", key: "messages", group: "CONNECT" }, { label: "Broadcasts", route: "/client/broadcasts", key: "broadcasts" }, { label: "Wallet", route: "/client/wallet", key: "wallet", group: "ACCOUNT" }, { label: "Settings", route: "/client/settings", key: "settings" }];

  const filteredCreators = useMemo(() => creators
    .filter((creator) => `${creator.name} ${creator.location} ${creator.categories.join(" ")}`.toLowerCase().includes(search.toLowerCase()))
    .filter((creator) => filter === "Online" ? creator.online : true), [creators, search, filter]);
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 4200); };
  const toggleLike = async (slug: string) => {
    const creator = creators.find((item) => item.slug === slug);
    if (!creator) return;
    const liked = !creator.liked;
    const response = await fetch(`/api/profiles/${encodeURIComponent(slug)}/interactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: liked ? "like" : "unlike" }) });
    if (!response.ok) { notify("That profile interaction could not be saved."); return; }
    setCreators((current) => current.map((item) => item.slug === slug ? { ...item, liked, likes: Math.max(0, item.likes + (liked ? 1 : -1)) } : item));
  };
  const blockCreator = async (creator: Creator) => {
    const response = await fetch(`/api/profiles/${encodeURIComponent(creator.slug)}/interactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "block" }) });
    if (!response.ok) { notify("That profile could not be blocked."); return; }
    setCreators((current) => current.filter((item) => item.id !== creator.id));
    notify(`${creator.name} has been blocked.`);
  };

  return <div className="portal">
    <aside className="portal-sidebar"><Link href="/" className="brand"><span className="brand-mark">m</span><span>my feet <b>show</b></span></Link><div className="workspace-chip"><span className={`workspace-avatar ${isModel ? "model-avatar" : "client-avatar"}`}>{names.first.slice(0, 1).toUpperCase()}</span><span><b>{names.first}</b><small>{names.role} account</small></span><ChevronDown size={15}/></div><nav className="side-nav">{nav.map((item) => <div key={item.key}>{item.group && <span className="nav-group-label">{item.group}</span>}<Link href={item.route} className={section === item.key ? "side-link active" : "side-link"}>{iconFor[item.key]}<span>{item.label}</span></Link></div>)}</nav><Link className="portal-switch" href={isModel ? "/client" : "/model"}><ArrowUpRight size={14}/> Switch to {isModel ? "client" : "creator"} view</Link><div className="side-help"><span className="help-spark"><Sparkles size={15}/></span><b>Need a hand?</b><p>Our friendly team is just a message away.</p><button onClick={() => notify("Support is not connected yet.")}>Visit help centre <ArrowRight size={14}/></button></div><button className="side-signout" onClick={async () => { try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.replace("/"); } }}><LogOut size={16}/> Sign out</button></aside>
    <div className="portal-main"><header className="portal-topbar"><div className="breadcrumb"><Link href="/">My Feet Show</Link><span>/</span><b>{nav.find((item) => item.key === section)?.label ?? "Home"}</b></div><div className="topbar-actions"><button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify("Notifications are not connected yet.")}><Bell size={18}/></button><div className="wallet-control"><button className="token-pill" onClick={() => setShowWalletMenu(!showWalletMenu)}><span className="coin">✦</span><span><b>—</b><small>not connected</small></span><ChevronDown size={15}/></button>{showWalletMenu && <div className="wallet-popover"><div className="wallet-pop-head"><span className="coin">✦</span><span><b>Token wallet</b><small>Unavailable</small></span></div><div className="wallet-pop-balance">Purchases and payouts are disabled</div><Link href={`/${role}/wallet`} className="button button-dark button-full">Wallet status <ArrowRight size={15}/></Link></div>}</div><Link className="top-avatar" href={`/${role}/settings`}>{isModel ? "M" : "A"}</Link></div></header>
      <main className="portal-content"><div className="portal-preview-notice" role="note">Profile data, likes, blocks, reports, comments, creator uploads, settings, moderation review, and Twilio messages are connected. Uploaded media stays private until approval. Purchases, payouts, content delivery, and paid video calls remain disabled while processor, scanning, billing, and safety setup are incomplete.</div>
        {section === "home" && (isModel ? <ModelHome /> : <ClientHome search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} filtered={filteredCreators} loading={creatorLoading} onLike={toggleLike} onBlock={(slug) => { const creator = creators.find((item) => item.slug === slug); if (creator) void blockCreator(creator); }} />)}
        {section === "content" && <PaymentsUnavailable />}
        {section === "media" && <CreatorMedia />}
        {section === "messages" && <ConnectedMessages role={role} />}
        {section === "broadcasts" && <VideoUnavailable />}
        {section === "wallet" && <WalletPage role={role} sandboxPayoutsEnabled={sandboxPayoutsEnabled} />}
        {section === "settings" && <ConnectedSettings role={role} />}
      </main><footer className="portal-footer"><span>© 2026 My Feet Show</span><span><Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/safety">Safety</Link><Link href="/legal/tokens">Tokens</Link><Link href="/legal/cookies">Cookies</Link></span></footer></div>
    {notice && <div className="toast"><span className="toast-check"><Check size={15}/></span>{notice}<button aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14}/></button></div>}
  </div>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div>;
}

function ClientHome({ search, setSearch, filter, setFilter, filtered, loading, onLike, onBlock }: { search: string; setSearch: (v: string) => void; filter: string; setFilter: (v: string) => void; filtered: Creator[]; loading: boolean; onLike: (v: string) => void; onBlock: (v: string) => void }) {
  return <><div className="welcome-banner client-welcome"><div><span className="eyebrow">CREATOR DISCOVERY</span><h1>Find your next<br/>favourite <em>creator.</em></h1><p>Browse profiles from active accounts that passed the age-assurance check.</p><Link href="#creator-discovery" className="button button-dark">Browse creators <ArrowRight size={15}/></Link></div><div className="banner-decoration"><div className="banner-sun">✳</div><div className="banner-orbit"/></div></div>
    <div className="list-heading"><div><span className="eyebrow">CREATOR DIRECTORY</span><h2>Creators <span className="heading-spark">✦</span></h2></div></div>
    <div className="discovery-toolbar" id="creator-discovery"><label className="search-field"><Search size={17}/><input placeholder="Search creators, interests, places..." value={search} onChange={(event) => setSearch(event.target.value)}/></label><div className="filter-tabs">{["All", "Online"].map((item) => <button key={item} className={filter === item ? "filter-tab active" : "filter-tab"} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
    <div className="portal-creator-grid">{filtered.map((creator) => <article className="portal-creator-card" key={creator.id}><div className="portal-creator-photo">{creator.avatarUrl ? <img src={creator.avatarUrl} alt={`${creator.name} profile`} /> : <div className="portal-placeholder-avatar">{creator.name.slice(0, 1).toUpperCase()}</div>}<span className="status-chip"><i/>{creator.online ? "ONLINE" : "OFFLINE"}</span><button className={creator.liked ? "heart-button liked" : "heart-button"} onClick={() => onLike(creator.slug)} aria-label={`${creator.liked ? "Unlike" : "Like"} ${creator.name}`}><Heart size={17} fill={creator.liked ? "currentColor" : "none"}/></button></div><div className="portal-creator-body"><div className="portal-creator-main"><div><h3><Link href={`/profiles/${creator.slug}`}>{creator.name}</Link></h3><small>{creator.handle}{creator.location ? ` · ${creator.location}` : ""}</small></div><div className="like-count"><Heart size={13} fill="currentColor"/> {creator.likes.toLocaleString()}</div></div><span className="tag-pill">{creator.categories[0] ?? "Creator"}</span><div className="portal-creator-foot"><span><b>{creator.rate}</b> tokens <small>/ min · unavailable</small></span><Link className="button button-dark button-compact" href={`/profiles/${creator.slug}`}>View profile <ArrowUpRight size={14}/></Link></div><div className="card-more-row"><Link href={`/profiles/${creator.slug}`}><MessageCircle size={13}/> Message</Link><button onClick={() => onBlock(creator.slug)}><ShieldAlert size={13}/> Block</button></div></div></article>)}</div>
    {!loading && filtered.length === 0 && <div className="empty-state"><Search size={23}/><b>{filter === "Online" ? "No creators are shown online" : "No creators found yet"}</b><span>{filter === "Online" ? "Presence is offline until a presence service is connected." : "Creators will appear after their profiles are set up and approved."}</span></div>}
    <div className="safety-note"><ShieldCheck size={16}/><span>Your space, your pace. <Link href="/legal/safety">Read about how we keep things considered.</Link></span></div>
  </>;
}

function ModelHome() {
  return <><div className="welcome-banner model-welcome"><div><span className="eyebrow">YOUR CREATOR SPACE</span><h1>Make today <em>yours.</em></h1><p>Update your creator profile, upload work, and review your conversations.</p><div className="banner-actions"><Link href="/model/media" className="button button-dark"><Plus size={15}/> Add new content</Link><Link href="/model/settings" className="button button-outline">Edit profile <ArrowUpRight size={14}/></Link></div></div></div><div className="section-tip"><ShieldCheck size={16}/><span>Files stay private until a moderator approves them. Paid access and live video will open after processor, billing, and safety operations are ready.</span><Link href="/model/messages">Open messages <ArrowRight size={14}/></Link></div></>;
}

function PaymentsUnavailable() {
  return <div className="service-unavailable"><span className="eyebrow">PRIVATE COLLECTION</span><h1>My content</h1><p>Purchases and paid content access are disabled until an eligible adult-services payment provider, refunds, and creator payouts are approved and connected.</p></div>;
}

function VideoUnavailable() {
  return <div className="service-unavailable"><span className="eyebrow">LIVE, TOGETHER</span><h1>Broadcasts</h1><p>Video room access stays disabled until the paid-session ledger, per-minute billing, moderation staffing, and UK safety review are complete.</p><button className="button button-outline" disabled>Video calls unavailable</button></div>;
}

function WalletPage({ role, sandboxPayoutsEnabled }: { role: Role; sandboxPayoutsEnabled: boolean }) {
  const isModel = role === "model";
  if (isModel && sandboxPayoutsEnabled) return <SandboxPayouts embedded />;
  return <><PageHeading eyebrow="WALLET" title={isModel ? "Earnings" : "Wallet"} description="Wallet activity is not available yet."/><div className="payout-note"><ShieldCheck size={18}/><div><b>{isModel ? "Payouts are disabled" : "Purchases are disabled"}</b><p>{isModel ? "Earnings and withdrawals will appear after an eligible payout provider, verified ledger, and commercial terms are in place." : "No token balance or purchase is available. Checkout will only be enabled after payment-provider approval and implementation."}</p></div></div><button className="button button-dark checkout-button" disabled>{isModel ? "Withdrawals unavailable" : "Purchases unavailable"}</button><div className="wallet-fineprint"><LockKeyhole size={14}/><span>Nothing on this screen moves money. <Link href="/legal/tokens">Read the draft token policy.</Link></span></div></>;
}
