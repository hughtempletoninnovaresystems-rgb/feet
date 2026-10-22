"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Flag, Heart, MessageCircle, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

type Profile = {
  id: string;
  display_name: string;
  handle: string;
  bio: string;
  location_label: string | null;
  categories: string[];
  call_rate_tokens_per_minute: number;
  allow_likes: boolean;
  allow_comments: boolean;
  likes: number;
  liked: boolean;
  blocked: boolean;
};
type Comment = { id: string; display_name: string; body: string; created_at: string };
type CreatorMedia = { id: string; title: string; description: string; media_type: string; price_tokens: number; published_at: string };

export default function ProfilePage({ slug }: { slug: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [media, setMedia] = useState<CreatorMedia[]>([]);
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [canMessage, setCanMessage] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/profiles/${encodeURIComponent(slug)}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("This profile is unavailable.");
      return await response.json() as { profile: Profile; comments: Comment[]; media: CreatorMedia[]; canMessage: boolean };
    }).then((result) => { if (active) { setProfile(result.profile); setComments(result.comments); setMedia(result.media ?? []); setCanMessage(result.canMessage); } })
      .catch(() => { if (active) setNotice("This profile is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const interact = async (payload: Record<string, string>) => {
    const response = await fetch(`/api/profiles/${encodeURIComponent(slug)}/interactions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({})) as { error?: string; liked?: boolean; blocked?: boolean; status?: string };
    if (!response.ok) throw new Error(result.error ?? "That action could not be completed.");
    if (payload.action === "like" || payload.action === "unlike") {
      setProfile((current) => current ? { ...current, liked: result.liked === true, likes: current.likes + (result.liked ? 1 : -1) } : current);
    }
    if (payload.action === "block" || payload.action === "unblock") {
      setProfile((current) => current ? { ...current, blocked: result.blocked === true } : current);
    }
    if (payload.action === "comment") {
      setComment("");
      setNotice("Your comment was submitted for moderator review.");
    } else if (payload.action === "report") setNotice("Your report was sent to the moderation team.");
    else if (payload.action === "block") setNotice("This creator is blocked.");
    else if (payload.action === "unblock") setNotice("This creator is unblocked.");
    else setNotice(payload.action === "like" ? "Profile liked." : "Profile unliked.");
  };

  const runInteraction = (payload: Record<string, string>) => {
    void interact(payload).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "That action could not be completed."));
  };

  const postComment = () => {
    if (!comment.trim()) return;
    runInteraction({ action: "comment", body: comment.trim() });
  };

  const startMessage = async () => {
    if (!profile || !canMessage) return;
    try {
      const response = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId: profile.id }) });
      const result = await response.json() as { conversationId?: string; error?: string };
      if (!response.ok || !result.conversationId) throw new Error(result.error ?? "Messaging is unavailable.");
      router.push(`/client/messages?conversation=${encodeURIComponent(result.conversationId)}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Messaging is unavailable.");
    }
  };

  if (!profile) return <main className="profile-page"><header className="profile-header"><Link href="/client" className="profile-back"><ArrowLeft size={16}/> Back to discover</Link><Link href="/" className="brand"><span className="brand-mark">m</span><span>my feet <b>show</b></span></Link></header><div className="profile-wrap"><div className="empty-state">{loading ? "Loading creator profile…" : notice || "This profile is unavailable."}</div></div></main>;

  const firstName = profile.display_name.split(" ")[0] ?? profile.display_name;
  return <main className="profile-page">
    <header className="profile-header"><Link href="/client" className="profile-back"><ArrowLeft size={16}/> Back to discover</Link><Link href="/" className="brand"><span className="brand-mark">m</span><span>my feet <b>show</b></span></Link><Link href="/client/settings" className="profile-login">Account</Link></header>
    <div className="profile-wrap">
      <div className="profile-cover"><span className="profile-cover-tag">CREATOR PROFILE</span></div>
      <div className="profile-main">
        <div className="profile-identity"><div className="profile-avatar profile-avatar-placeholder">{firstName.slice(0, 1).toUpperCase()}</div><div className="profile-identity-copy"><span className="eyebrow">INDEPENDENT CREATOR</span><h1>{profile.display_name}</h1><p>{profile.handle}{profile.location_label ? <><span> · </span>{profile.location_label}</> : null}</p></div><div className="profile-actions"><button className={profile.liked ? "button button-light following" : "button button-light"} disabled={!profile.allow_likes} onClick={() => runInteraction({ action: profile.liked ? "unlike" : "like" })}><Heart size={15} fill={profile.liked ? "currentColor" : "none"}/>{profile.liked ? "Liked" : "Like"}</button><button className="icon-button" aria-label="Report profile" onClick={() => { const reason = window.prompt("Why are you reporting this profile?"); if (reason?.trim()) runInteraction({ action: "report", reason: reason.trim() }); }}><Flag size={16}/></button><button className="icon-button" aria-label={profile.blocked ? "Unblock profile" : "Block profile"} onClick={() => runInteraction({ action: profile.blocked ? "unblock" : "block" })}><ShieldAlert size={17}/></button></div></div>
        <div className="profile-stats"><span><Heart size={15} fill="currentColor"/> {profile.likes.toLocaleString()} likes</span><span><MessageCircle size={15}/> {comments.length} comments</span>{profile.categories[0] && <span className="tag-pill">{profile.categories[0]}</span>}</div>
        <div className="profile-columns"><section className="profile-about"><div className="list-heading"><div><span className="eyebrow">A LITTLE ABOUT ME</span><h2>Hello, I&apos;m {firstName}.</h2></div></div><p className="profile-bio">{profile.bio || "This creator has not added a bio yet."}</p>
          <div className="profile-content-title"><span className="eyebrow">THE LATEST DETAILS</span><span>Purchases are currently disabled.</span></div>
          <div className="profile-content-grid">{media.map((item) => <article className="profile-content-card" key={item.id}><div className="profile-content-placeholder">{item.media_type === "video" ? "VIDEO" : "PHOTO SET"}</div><span><span className="content-lock">✦</span> {item.price_tokens.toLocaleString()} tokens · unavailable</span></article>)}{media.length === 0 && <p className="empty-state">No approved content is published yet.</p>}</div>
          <div className="comments-panel"><div className="comments-head"><div><span className="eyebrow">COMMUNITY</span><h2>Comments <span>({comments.length})</span></h2></div></div>
            {profile.allow_comments && <div className="comment-compose"><div className="comment-avatar">Y</div><input value={comment} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") postComment(); }} placeholder={`Leave ${firstName} a kind comment…`}/><button onClick={postComment} disabled={!comment.trim()} aria-label="Submit comment"><ArrowRight size={16}/></button></div>}
            <div className="comment-list">{comments.map((item) => <div className="comment-item" key={item.id}><div className="comment-avatar">{item.display_name.slice(0, 1).toUpperCase()}</div><div><b>{item.display_name}</b><p>{item.body}</p><small>{new Date(item.created_at).toLocaleDateString()}</small></div></div>)}{comments.length === 0 && <p className="empty-state">No approved comments yet.</p>}</div>
          </div>
        </section><aside className="profile-aside"><div className="profile-connect-card"><span className="connect-icon"><MessageCircle size={18}/></span><h3>Say hello to {firstName}</h3><p>Start a private conversation through the platform.</p><button className="button button-dark button-full" onClick={() => void startMessage()} disabled={!canMessage}>Send a message <ArrowRight size={15}/></button></div><div className="profile-community-note"><Heart size={16}/><span>Comments wait for moderator review before they appear.</span></div></aside></div>
        {profile.blocked && <div className="blocked-banner profile-block-banner"><ShieldAlert size={15}/> This creator is blocked. <button onClick={() => runInteraction({ action: "unblock" })}>Unblock</button></div>}
      </div>
    </div>
    {notice && <div className="toast"><span className="toast-check">✓</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}
    <footer className="profile-footer"><span>© 2026 My Feet Show</span><span><Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/safety">Safety</Link><Link href="/legal/tokens">Tokens</Link><Link href="/legal/cookies">Cookies</Link></span></footer>
  </main>;
}
