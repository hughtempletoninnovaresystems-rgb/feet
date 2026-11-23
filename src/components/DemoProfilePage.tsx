import Link from "next/link";
import { ArrowLeft, ArrowRight, Heart, MessageCircle } from "lucide-react";
import { demoImageUrl, type DemoProfile } from "@/lib/demo-profiles";

export default function DemoProfilePage({ profile }: { profile: DemoProfile }) {
  return <main className="profile-page">
    <header className="profile-header"><Link href="/#discover" className="profile-back"><ArrowLeft size={16}/> Back to home</Link><Link href="/" className="brand"><span className="brand-mark">m</span><span>my feet <b>show</b></span></Link><Link href="/legal/safety" className="profile-login">Safety</Link></header>
    <div className="profile-wrap">
      <div className="site-preview-banner" role="note">Demo profile. This is a fictional example, not a real creator. Nothing can be bought, sent or posted.</div>
      <div className="profile-cover" style={{ background: `linear-gradient(rgba(30,24,22,.12), rgba(30,24,22,.28)), ${profile.colour} url(${demoImageUrl(profile.image, 1400)}) center/cover` }}><span className="profile-cover-tag">DEMO PROFILE</span></div>
      <div className="profile-main">
        <div className="profile-identity"><div className="profile-avatar" style={{ background: `${profile.colour} url(${demoImageUrl(profile.image, 300)}) center/cover` }} role="img" aria-label={`${profile.name}, sample creator photo`} /><div className="profile-identity-copy"><span className="eyebrow">SAMPLE CREATOR</span><h1>{profile.name}</h1><p>{profile.handle}<span> · </span>{profile.location}</p></div></div>
        <div className="profile-stats"><span><Heart size={15} fill="currentColor"/> {profile.likes.toLocaleString()} likes</span><span><MessageCircle size={15}/> {profile.comments.length} comments</span><span className="tag-pill">{profile.category}</span><span className="tag-pill">{profile.rate} tokens/min</span></div>
        <div className="profile-columns"><section className="profile-about"><div className="list-heading"><div><span className="eyebrow">A LITTLE ABOUT ME</span><h2>Hello, I&apos;m {profile.name}.</h2></div></div><p className="profile-bio">{profile.bio}</p>
          <div className="profile-content-title"><span className="eyebrow">THE LATEST DETAILS</span><span>Demo only. Purchases are disabled.</span></div>
          <div className="profile-content-grid">{profile.content.map((item) => <article className="profile-content-card" key={item.title}><div className="profile-content-placeholder">{item.kind}</div><span><span className="content-lock">✦</span> {item.title} · {item.tokens} tokens · unavailable</span></article>)}</div>
          <div className="comments-panel"><div className="comments-head"><div><span className="eyebrow">COMMUNITY</span><h2>Comments <span>({profile.comments.length})</span></h2></div></div>
            <div className="comment-list">{profile.comments.map((item, index) => <div className="comment-item" key={index}><div className="comment-avatar">{item.name.slice(0, 1)}</div><div><b>{item.name}</b><p>{item.body}</p></div></div>)}</div>
          </div>
        </section><aside className="profile-aside"><div className="profile-connect-card"><span className="connect-icon"><MessageCircle size={18}/></span><h3>Say hello to {profile.name}</h3><p>Messaging opens at launch, after age verification. This is a demo.</p><button className="button button-dark button-full" disabled>Send a message <ArrowRight size={15}/></button></div><div className="profile-community-note"><b>About this demo</b><p>Profiles, comments and prices are made up to show how the service will look. Real creators appear only after age verification and moderation.</p></div></aside></div>
      </div>
    </div>
    <footer className="profile-footer"><span>© 2026 My Feet Show</span><span><Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/safety">Safety</Link><Link href="/legal/refunds">Refunds</Link></span></footer>
  </main>;
}
