// Grammi's page: send the baby a surprise from her own phone. She picks a photo or one of the
// game's pictures, records a message in her own voice, and sends it; it waits in his game until he
// plays. She sees here when he opened it. Opened from the link the parents made (?peekaboo=send#box).
import { useCallback, useEffect, useState } from "react";
import { when } from "./keep";
import { loadJson, saveJson } from "./store";
import { CATEGORIES, THINGS, type Thing } from "./things";
import { dataUrl, playData, record, smallPhoto } from "./voice";
import "./peekaboo.css";

const MESSAGE_MS = 20_000;
interface Sent {
  id: string;
  picture: string;
  note: string;
  sent: number;
  opened: number;
  photo: boolean;
}

const senderToken = () =>
  loadJson("peekaboo.sender", (raw) => {
    if (typeof raw === "string" && raw.length >= 12) return raw;
    const made = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    saveJson("peekaboo.sender", made);
    return made;
  });

const at = (t: number) => `${when(t)}, ${new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

function PictureOf({ thing }: { thing: Thing }) {
  return <span className="pk-send-emoji" aria-hidden="true">{thing.emoji}</span>;
}

export function SendSurprise({ box, onLeave }: { box: string; onLeave: () => void }) {
  const [from, setFrom] = useState(() => loadJson("peekaboo.from", (r) => (typeof r === "string" && r ? r : "Grammi")));
  const [kind, setKind] = useState<"photo" | "picture">("picture");
  const [picture, setPicture] = useState<string>("");
  const [photo, setPhoto] = useState<string>("");
  const [voice, setVoice] = useState<string>("");
  const [recording, setRecording] = useState<{ stop(): Promise<Blob> } | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [gone, setGone] = useState(false);
  const sender = senderToken();

  const refresh = useCallback(async () => {
    const r = await fetch(`/surprises/${encodeURIComponent(box)}/sent?sender=${sender}`, { cache: "no-store" }).catch(() => null);
    if (r?.status === 404) return setGone(true);
    if (r?.ok) setSent(((await r.json()) as { sent: Sent[] }).sent);
  }, [box, sender]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const startRecording = async () => {
    setProblem(null);
    try {
      const r = await record(MESSAGE_MS);
      setRecording({ stop: r.stop });
      // Twenty seconds is the most: it stops by itself then.
      void r.done.then(async (clip) => {
        setRecording(null);
        if (clip.size) setVoice(await dataUrl(clip));
      });
    } catch {
      setProblem("Couldn't use the microphone. Allow it for this page and try again.");
    }
  };
  const stopRecording = () => void recording?.stop();

  const send = async () => {
    setProblem(null);
    if (!from.trim()) return setProblem("Put your name in, so he knows who it's from.");
    if (kind === "photo" ? !photo : !picture) return setProblem(kind === "photo" ? "Pick a photo first." : "Pick a picture first.");
    setSending(true);
    saveJson("peekaboo.from", from.trim());
    const r = await fetch(`/surprises/${encodeURIComponent(box)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: from.trim(), sender, picture: kind === "picture" ? picture : "", photo: kind === "photo" ? photo : "", audio: voice, note }),
    }).catch(() => null);
    setSending(false);
    if (!r) return setProblem("Couldn't send it: check the internet and try again.");
    if (!r.ok) return setProblem(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't send it. Try again.");
    setDone(true);
    setPicture("");
    setPhoto("");
    setVoice("");
    setNote("");
    void refresh();
  };

  if (gone) {
    return (
      <main className="pk-join">
        <h1>🎁 Send a surprise</h1>
        <p>This link doesn't work any more. Ask for a new one.</p>
        <button type="button" className="secondary" onClick={onLeave}>
          Go to the parlor
        </button>
      </main>
    );
  }

  const chosen = THINGS.find((th) => th.id === picture);
  return (
    <main className="pk-send">
      <h1>
        <span aria-hidden="true">🎁</span> Send him a surprise
      </h1>
      <p className="pk-send-lead">Pick something to show him and say something to him. It waits in his game until he plays next: a present wiggles on his screen, he taps it, and out comes your surprise, in your voice.</p>

      {done ? (
        <section className="pk-send-card pk-send-done">
          <p className="pk-send-big">🎉 Sent!</p>
          <p>It's waiting for him. You'll see below when he opens it.</p>
          <button type="button" className="pk-go" onClick={() => setDone(false)}>
            Send another
          </button>
        </section>
      ) : (
        <section className="pk-send-card">
          <label className="pk-send-field">
            <span>From</span>
            <input type="text" value={from} maxLength={24} onChange={(e) => setFrom(e.target.value)} />
          </label>

          <h2>1. Something to show him</h2>
          <div className="pk-modes" role="radiogroup" aria-label="A photo or a picture">
            <button type="button" role="radio" aria-checked={kind === "picture"} className={kind === "picture" ? "pk-on" : ""} onClick={() => setKind("picture")}>
              🐮 A picture
            </button>
            <button type="button" role="radio" aria-checked={kind === "photo"} className={kind === "photo" ? "pk-on" : ""} onClick={() => setKind("photo")}>
              📷 A photo
            </button>
          </div>
          {kind === "photo" ? (
            <label className="pk-send-photo">
              {photo ? <img src={photo} alt="Your photo" /> : <span>Take or pick a photo (you, the dog, the garden…)</span>}
              <input type="file" accept="image/*" onChange={async (e) => e.target.files?.[0] && setPhoto(await smallPhoto(e.target.files[0], 480).catch(() => ""))} />
            </label>
          ) : (
            <div className="pk-send-pictures">
              {CATEGORIES.filter((c) => c.id !== "family").map((c) => (
                <div key={c.id}>
                  <h3>{c.name}</h3>
                  <div className="pk-send-grid">
                    {THINGS.filter((th) => th.category === c.id).map((th) => (
                      <button key={th.id} type="button" className={picture === th.id ? "pk-on" : ""} aria-pressed={picture === th.id} aria-label={th.word} onClick={() => setPicture(th.id)}>
                        <PictureOf thing={th} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {chosen && <p className="pk-send-chosen">You picked: {chosen.emoji} {chosen.word}</p>}
            </div>
          )}

          <h2>2. Say something to him</h2>
          <p className="fine">Up to twenty seconds. "Hi sweetheart, it's Grammi! Look, a duck! Quack quack!"</p>
          <div className="pk-row">
            {recording ? (
              <button type="button" className="pk-recording" onClick={stopRecording}>
                ⏹ Stop
              </button>
            ) : (
              <button type="button" className="secondary" onClick={() => void startRecording()}>
                🎙 {voice ? "Record again" : "Record"}
              </button>
            )}
            {voice && !recording && (
              <button type="button" className="secondary" onClick={() => void playData(voice)}>
                ▶ Listen
              </button>
            )}
          </div>

          <label className="pk-send-field">
            <span>A few words under it (for Mommy and Daddy to read him; optional)</span>
            <input type="text" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="Love you, little one!" />
          </label>

          {problem && <p className="pk-problem">{problem}</p>}
          <button type="button" className="pk-go" disabled={sending} onClick={() => void send()}>
            {sending ? "Sending…" : "🎁 Send the surprise"}
          </button>
        </section>
      )}

      <section className="pk-send-card">
        <h2>What you've sent</h2>
        {sent === null ? (
          <p className="fine">Looking…</p>
        ) : sent.length ? (
          <ul className="pk-list">
            {sent.map((s) => {
              const th = THINGS.find((t) => t.id === s.picture);
              return (
                <li key={s.id}>
                  <span className="pk-list-name">
                    <span className="pk-thumb" aria-hidden="true">
                      {s.photo ? "📷" : (th?.emoji ?? "🎁")}
                    </span>
                    <span>
                      {s.photo ? "A photo" : (th?.word ?? "A picture")}
                      {s.note && <span className="fine"> · “{s.note}”</span>}
                      <br />
                      <span className="fine">Sent {at(s.sent)}</span>
                    </span>
                  </span>
                  <span className={s.opened ? "pk-said" : "pk-waiting"}>{s.opened ? `Opened ✓ ${at(s.opened)}` : "Waiting for him"}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="fine">Nothing yet.</p>
        )}
      </section>
    </main>
  );
}
