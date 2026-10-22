"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Flag, LockKeyhole, MessageCircle, ShieldAlert, Video } from "lucide-react";

type Conversation = { id: string; partner_user_id: string; partner_name: string; partner_handle: string; last_body: string | null; last_created_at: string | null };
type Message = { id: string; sender_user_id: string; body: string; created_at: string };

export default function ConnectedMessages({ role }: { role: "client" | "model" }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    const data = await response.json() as { conversations?: Conversation[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Messaging service is unavailable.");
    const list = data.conversations ?? [];
    setConversations(list);
    return list;
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) { setMessages([]); return; }
    const response = await fetch(`/api/conversations/${conversationId}/messages`, { cache: "no-store" });
    const data = await response.json() as { messages?: Message[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Messages could not be loaded.");
    setMessages(data.messages ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const list = await loadConversations();
        const params = new URLSearchParams(window.location.search);
        const requestedId = params.get("conversation");
        const targetUserId = params.get("to");
        if (targetUserId && role === "client") {
          const response = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId }) });
          const data = await response.json() as { conversationId?: string; error?: string };
          if (!response.ok || !data.conversationId) throw new Error(data.error ?? "Conversation could not be opened.");
          const updated = await loadConversations();
          if (active) setConversations(updated);
          if (active) setActiveId(data.conversationId);
          window.history.replaceState(null, "", window.location.pathname + `?conversation=${encodeURIComponent(data.conversationId)}`);
        } else if (requestedId && list.some((conversation) => conversation.id === requestedId)) {
          if (active) setActiveId(requestedId);
        } else if (list[0] && active) setActiveId(list[0].id);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Messaging service is unavailable.");
      }
    };
    void initialize();
    return () => { active = false; };
  }, [loadConversations, role]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let active = true;
    const refresh = async () => {
      try { await loadMessages(activeId); if (active) setError(""); }
      catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Messages could not be loaded."); }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [activeId, loadMessages]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/conversations/${activeId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, requestId: crypto.randomUUID() }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The message could not be sent.");
      setDraft("");
      await Promise.all([loadMessages(activeId), loadConversations()]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The message could not be sent."); }
    finally { setBusy(false); }
  };

  const block = async () => {
    if (!activeConversation) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/blocks/${activeConversation.partner_user_id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocked: true }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Member could not be blocked.");
      setNotice(`${activeConversation.partner_name} is blocked.`);
      setActiveId("");
      setConversations((current) => current.filter((conversation) => conversation.id !== activeConversation.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Member could not be blocked."); }
    finally { setBusy(false); }
  };

  const report = async (message: Message) => {
    if (!activeConversation) return;
    const response = await fetch(`/api/conversations/${activeConversation.id}/messages/${message.id}/report`, { method: "POST" });
    const data = await response.json() as { error?: string };
    setNotice(response.ok ? "Message reported to the moderation team." : data.error ?? "Message could not be reported.");
  };

  return <><div className="connected-messages-heading"><div><span className="eyebrow">PRIVATE CONVERSATIONS</span><h1>Messages</h1><p>Messages are sent through the configured Twilio Conversations service.</p></div>{role === "client" && <Link className="button button-outline" href="/client">Find a creator <MessageCircle size={14}/></Link>}</div>
    {(error || notice) && <p role={error ? "alert" : "status"} className={error ? "creator-media-error" : "creator-media-notice"}>{error || notice}</p>}
    <div className="chat-window"><aside className="chat-list"><div className="connected-chat-list-heading">Your conversations</div>{conversations.map((conversation) => <button className={activeId === conversation.id ? "chat-person active" : "chat-person"} key={conversation.id} onClick={() => { setActiveId(conversation.id); window.history.replaceState(null, "", window.location.pathname + `?conversation=${encodeURIComponent(conversation.id)}`); }}><span className="chat-avatar">{conversation.partner_name.slice(0, 1).toUpperCase()}</span><span><b>{conversation.partner_name}</b><small>{conversation.last_body || "No messages yet"}</small></span></button>)}{conversations.length === 0 && <p className="connected-chat-empty">No conversations yet.</p>}</aside>
      <div className="chat-detail">{activeConversation ? <><div className="chat-detail-head"><span className="chat-avatar">{activeConversation.partner_name.slice(0, 1).toUpperCase()}</span><span><b>{activeConversation.partner_name}</b><small>{activeConversation.partner_handle}</small></span><div><button className="icon-button" aria-label="Video call" title="Video calls are disabled until paid-session billing is approved." disabled><Video size={17}/></button><button className="icon-button" aria-label="Block member" onClick={() => void block()} disabled={busy}><ShieldAlert size={17}/></button></div></div><div className="chat-messages connected-chat-messages" ref={scrollRef}>{messages.map((message) => { const mine = message.sender_user_id !== activeConversation.partner_user_id; return <div className={mine ? "connected-message-row mine" : "connected-message-row"} key={message.id}><div className={mine ? "message-bubble sent" : "message-bubble received"}>{message.body}<small>{new Date(message.created_at).toLocaleString()}</small></div>{!mine && <button className="message-report-button" aria-label="Report message" onClick={() => void report(message)}><Flag size={12}/></button>}</div>; })}{messages.length === 0 && <p className="connected-chat-empty">Send a first message to start the conversation.</p>}</div><div className="chat-compose"><button className="icon-button" aria-label="Attachments unavailable" title="Attachments are unavailable until media sharing is reviewed." disabled><LockKeyhole size={15}/></button><input value={draft} maxLength={1600} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Write a thoughtful message…" disabled={busy}/><button className="send-button" aria-label="Send message" onClick={() => void send()} disabled={busy || !draft.trim()}><ArrowRight size={17}/></button></div><p className="chat-safety"><LockKeyhole size={12}/> Keep conversations kind, respectful, and within the platform.</p></> : <div className="connected-chat-empty chat-empty-state">{conversations.length ? "Choose a conversation." : "Start from a creator profile to message."}</div>}</div>
    </div></>;
}
