"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Heart, Menu, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return <main className="landing">
    <header className="site-nav">
      <Link href="/" className="brand"><span className="brand-mark">m</span><span>my feet <b>show</b></span></Link>
      <nav className={menuOpen ? "nav-links open" : "nav-links"}>
        <a href="#discover" onClick={() => setMenuOpen(false)}>Discover</a>
        <a href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#creators" onClick={() => setMenuOpen(false)}>For creators</a>
        <Link href="/login" className="mobile-login">Log in</Link>
      </nav>
      <div className="nav-actions"><Link href="/login" className="nav-login">Log in</Link><Link href="/register?role=client" className="button button-dark button-small">Join the show <ArrowRight size={15} /></Link></div>
      <button className="menu-button" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
    </header>
    <div className="site-preview-banner" role="note">Pre-launch. UK registration and creator discovery will open after legal, age-assurance, payment, and safety setup is complete.</div>

    <section className="hero wrap">
        <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" /> YOUR SPACE. YOUR SHOW.</div>
        <h1>A little more<br /><em>personal.</em></h1>
        <p className="hero-lede">Meet independent creators, discover their work, and connect in a space made for the details.</p>
        <div className="hero-buttons"><button className="button button-dark" disabled title="Opens after UK age-assurance and service sign-off">Creator discovery opens at launch <ArrowRight size={17} /></button><Link href="/register?role=model" className="button button-light">I&apos;m a creator</Link></div>
        <div className="trust-row"><span className="trust-icon"><ShieldCheck size={20}/></span><div><b>Safety setup in progress</b><small>UK launch · Age assurance · Creator-led</small></div></div>
      </div>
      <div className="hero-art" aria-label="Editorial portrait of a pedicure in sandals">
        <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <div className="hero-photo-frame"><img src="https://images.unsplash.com/photo-1662132090920-060bba5cdf18?auto=format&fit=crop&w=1050&q=85" alt="A warm, editorial detail of a pedicure in suede sandals" /></div>
        <div className="floating-note note-top"><span className="note-icon"><Sparkles size={15} /></span><span><b>Made for you</b><small>Discover your kind of detail</small></span></div>
        <div className="floating-note note-bottom"><span className="live-pip" /><span><b>Pre-launch</b><small>Marketplace setup in progress</small></span><ArrowUpRight size={16} /></div>
        <div className="hero-stamp">M<br /><small>F</small><br />S</div>
        <div className="hero-caption">A closer look at the things we love.</div>
      </div>
      <a className="scroll-cue" href="#discover"><span>SCROLL TO DISCOVER</span><ArrowDown size={14} /></a>
    </section>

    <section className="discover-section" id="discover">
      <div className="wrap">
        <div className="section-heading"><div><div className="eyebrow">THE PEOPLE BEHIND THE DETAILS</div><h2>Creator discovery opens <em>at launch.</em></h2></div></div>
        <div className="creator-grid" id="creators"><div className="empty-state"><ShieldCheck size={24}/><b>We&apos;re getting the community ready.</b><span>Verified creator profiles will appear after UK age-assurance and safety checks are complete.</span></div></div>
        <div className="browse-strip"><span>No sample creator profiles or fake availability are shown.</span><Link href="/legal/safety" className="button button-outline">Read the safety approach <ArrowRight size={16} /></Link></div>
      </div>
    </section>

    <section className="how-section wrap" id="how">
      <div className="how-intro"><div className="eyebrow">A SPACE THAT FEELS LIKE YOURS</div><h2>It starts with<br /><em>a hello.</em></h2><p>My Feet Show brings discovery, direct connection, and creator owned content into one considered space.</p><Link href="/register?role=client" className="text-link">Get started <ArrowRight size={16} /></Link></div>
      <div className="steps-list"><div className="step-item"><span className="step-no">01</span><span className="step-icon"><Sparkles size={21} /></span><div><h3>Discover at your pace</h3><p>Find independent creators by style, interests, or who is live right now.</p></div><ArrowUpRight className="step-arrow" size={18} /></div><div className="step-item"><span className="step-no">02</span><span className="step-icon"><Heart size={21} /></span><div><h3>Connect directly</h3><p>Follow, message, and enjoy personal live video with clear per-minute pricing.</p></div><ArrowUpRight className="step-arrow" size={18} /></div><div className="step-item"><span className="step-no">03</span><span className="step-icon"><ShieldCheck size={21} /></span><div><h3>Keep it in your control</h3><p>Private media, transparent token prices, and simple block and report tools.</p></div><ArrowUpRight className="step-arrow" size={18} /></div></div>
    </section>

    <section className="creator-callout" id="for-creators"><div className="callout-inner wrap"><div><div className="eyebrow">MADE FOR INDEPENDENT CREATORS</div><h2>Your work.<br /><em>Your terms.</em></h2><p>Set your prices, share your content, and build real connections with people who appreciate what you do.</p><Link href="/register?role=model" className="button button-cream">Start creating <ArrowRight size={16} /></Link></div><div className="callout-art"><div className="callout-blob blob-a" /><div className="callout-blob blob-b" /><div className="callout-photo"><img src="https://images.unsplash.com/photo-1662132090867-57a37fa1edf8?auto=format&fit=crop&w=700&q=85" alt="Pedicure detail in warm natural light" /></div><div className="creator-badge"><span className="badge-coin">✦</span><span><b>Set your own prices</b><small>Content · Calls · Always yours</small></span><Check size={16} /></div></div></div></section>

    <section className="promise-section wrap"><div className="promise-card"><span className="promise-icon"><ShieldCheck size={24} /></span><div><div className="eyebrow">GOOD CONNECTIONS START WITH TRUST</div><h2>Thoughtful by design.</h2><p>Adults only. Creators choose what to share and what it costs. Your content stays yours, and your boundaries are always respected.</p></div><Link href="/legal/safety" className="text-link">Our safety promise <ArrowRight size={16} /></Link></div></section>

    <footer className="site-footer"><div className="wrap"><div className="footer-main"><div className="footer-brand"><Link href="/" className="brand"><span className="brand-mark">m</span><span>my feet <b>show</b></span></Link><p>A little more personal.<br />A lot more yours.</p></div><div className="footer-links"><div><b>Explore</b><Link href="/client">Discover creators</Link><Link href="/register?role=model">Become a creator</Link><Link href="/client/broadcasts">Live broadcasts</Link></div><div><b>My Feet Show</b><Link href="/login">Log in</Link><Link href="/register">Create an account</Link><Link href="/client/settings">Settings</Link></div><div><b>The important bits</b><Link href="/legal/terms">Terms of service</Link><Link href="/legal/privacy">Privacy policy</Link><Link href="/legal/safety">Community & safety</Link><Link href="/legal/tokens">Tokens & payouts</Link><Link href="/legal/cookies">Cookie policy</Link><Link href="/legal/creators">Creator guidelines</Link></div></div></div><div className="footer-bottom"><span>© 2026 My Feet Show. All rights reserved.</span><span>Adults only · Independent creators · Made with care</span></div></div></footer>
  </main>;
}
