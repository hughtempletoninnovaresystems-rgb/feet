"use client";

import { useRef, useState } from "react";
import type { LocalTrack, RemoteParticipant, RemoteTrack, Room } from "twilio-video";

export default function FundedVideoRoom({ callId }: { callId: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Join only if you are ready to share your camera and microphone.");
  const [error, setError] = useState("");

  const join = async () => {
    if (busy || roomRef.current) return;
    setBusy(true); setError(""); setStatus("Connecting…");
    try {
      const response = await fetch(`/api/calls/${callId}/video-token`, { method: "POST" });
      const data = await response.json() as { token?: string; roomName?: string; error?: string };
      if (!response.ok || !data.token || !data.roomName) throw new Error(data.error ?? "This funded video session is unavailable.");
      const video = await import("twilio-video");
      const room = await video.connect(data.token, { name: data.roomName, audio: true, video: { width: 1280, height: 720 } });
      roomRef.current = room;
      setConnected(true);
      setStatus("Connected. Leave the session when you are finished.");
      const stage = stageRef.current;
      const attachTrack = (track: RemoteTrack | LocalTrack) => {
        if (!stage || track.kind === "data") return;
        const element = track.attach();
        element.className = track.kind === "video" ? "video-track" : "audio-track";
        if (element instanceof HTMLVideoElement) element.autoplay = true;
        stage.appendChild(element);
      };
      const attachParticipant = (participant: RemoteParticipant) => {
        participant.tracks.forEach((publication) => { if (publication.track) attachTrack(publication.track); });
        participant.on("trackSubscribed", attachTrack);
        participant.on("trackUnsubscribed", (track) => { if (track.kind !== "data") track.detach().forEach((element) => element.remove()); });
      };
      room.localParticipant.tracks.forEach((publication) => { if (publication.track) attachTrack(publication.track); });
      room.participants.forEach(attachParticipant);
      room.on("participantConnected", attachParticipant);
      room.on("trackSubscribed", attachTrack);
      room.on("trackUnsubscribed", (track) => { if (track.kind !== "data") track.detach().forEach((element) => element.remove()); });
      room.on("disconnected", () => { roomRef.current = null; setConnected(false); if (stageRef.current) stageRef.current.replaceChildren(); setStatus("The video session has ended."); });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The video session could not be joined.");
      setStatus("Not connected.");
    } finally { setBusy(false); }
  };

  const leave = () => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setConnected(false);
    stageRef.current?.replaceChildren();
    setStatus("You left the video session.");
  };

  return <main className="funded-video-page"><header><span className="eyebrow">PRIVATE VIDEO SESSION</span><h1>Video call</h1><p>{status}</p></header>{error && <p role="alert" className="creator-media-error">{error}</p>}<div className="funded-video-stage" ref={stageRef}/><div className="funded-video-actions"><button className="button button-dark" onClick={() => void join()} disabled={busy || connected}>{busy ? "Connecting…" : "Join call"}</button>{connected && <button className="button button-outline" onClick={leave}>Leave call</button>}</div><p className="chat-safety">Use the report controls in your account if anything feels unsafe.</p></main>;
}
