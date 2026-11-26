// The grown-ups' parts of Peekaboo's settings: their own pictures, the family, their voices, his
// words, the album, and the surprise box for Grammi.
import { useEffect, useMemo, useState } from "react";
import { ShareQr } from "../ShareQr";
import { album, dropSnap, heSaid, loadBox, saveBox, sendLink, togglePractice, unsay, when, type Box, type Snap, type Words } from "./keep";
import { THINGS, type Mine, type Person, type Thing } from "./things";
import { dropRecording, keepRecording, record, recordedKeys, say, smallPhoto } from "./voice";

/** A section that opens and closes, so the settings stay short on a phone. */
export function Fold({ title, note, open, children }: { title: string; note?: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="pk-section pk-fold" open={open}>
      <summary>
        <h3>{title}</h3>
        {note && <span className="pk-fold-note">{note}</span>}
      </summary>
      <div className="pk-fold-body">{children}</div>
    </details>
  );
}

export function Thumb({ thing }: { thing: Thing }) {
  return thing.photo ? <img className="pk-thumb" src={thing.photo} alt="" /> : <span className="pk-thumb" aria-hidden="true">{thing.emoji}</span>;
}

/**
 * Recordings of a grown-up's own voice, one per picture: a baby knows Mama's voice better than
 * any other. `prefix` keeps sung verses ("song:") apart from spoken words.
 */
export function Voices({ things, prefix = "", title, blurb, most = 10_000 }: { things: Thing[]; prefix?: string; title: string; blurb: string; most?: number }) {
  const [have, setHave] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ id: string; stop(): Promise<Blob> } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => void recordedKeys().then((keys) => setHave(new Set(keys))), []);
  const begin = async (key: string) => {
    setProblem(null);
    try {
      const r = await record(most);
      setBusy({ id: key, stop: r.stop });
      void r.done.then(() => setBusy((b) => (b?.id === key ? { ...b } : b)));
    } catch {
      setProblem("Couldn't use the microphone. Allow it for this page, and try again.");
    }
  };
  const end = async () => {
    if (!busy) return;
    const clip = await busy.stop();
    const key = busy.id;
    setBusy(null);
    if (clip.size) {
      await keepRecording(key, clip).catch(() => setProblem("Couldn't keep that recording on this device."));
      setHave((h) => new Set(h).add(key));
      void say("", key);
    }
  };
  return (
    <Fold title={title} note={`${things.filter((th) => have.has(prefix + th.id)).length} recorded`}>
      <p className="fine">{blurb}</p>
      {problem && <p className="fine pk-problem">{problem}</p>}
      <ul className="pk-list">
        {things.map((th) => {
          const key = prefix + th.id;
          return (
            <li key={key}>
              <span className="pk-list-name">
                <Thumb thing={th} /> {th.word}
              </span>
              {busy?.id === key ? (
                <button type="button" className="pk-recording" onClick={() => void end()}>
                  ⏹ Stop
                </button>
              ) : (
                <button type="button" className="secondary" disabled={!!busy} onClick={() => void begin(key)}>
                  🎙 {have.has(key) ? "Again" : "Record"}
                </button>
              )}
              {have.has(key) && busy?.id !== key && (
                <>
                  <button type="button" className="secondary" aria-label={`Play ${th.word}`} onClick={() => void say(th.say, key)}>
                    ▶
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Remove your recording of ${th.word}`}
                    onClick={() =>
                      void dropRecording(key).then(() =>
                        setHave((h) => {
                          const next = new Set(h);
                          next.delete(key);
                          return next;
                        }),
                      )
                    }
                  >
                    ✕
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Fold>
  );
}

export function Family({ family, onChange }: { family: Person[]; onChange: (f: Person[]) => void }) {
  const set = (i: number, p: Partial<Person>) => onChange(family.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <Fold title="Family" note={family.map((p) => p.name).filter(Boolean).join(", ")}>
      <p className="fine">Names and photos of the people he knows, him too. Photos stay on this device (and go to the other phone during a call).</p>
      <ul className="pk-list">
        {family.map((p, i) => (
          <li key={i}>
            <label className="pk-photo">
              {p.photo ? <img src={p.photo} alt={`${p.name}'s photo`} /> : <span aria-hidden="true">{p.emoji}</span>}
              <input type="file" accept="image/*" onChange={async (e) => e.target.files?.[0] && set(i, { photo: await smallPhoto(e.target.files[0]).catch(() => undefined) })} aria-label={`A photo of ${p.name || "this person"}`} />
            </label>
            <input type="text" value={p.name} maxLength={24} placeholder="Name" onChange={(e) => set(i, { name: e.target.value })} aria-label="Name" />
            <button type="button" className="secondary" aria-label={`Remove ${p.name || "this person"}`} onClick={() => onChange(family.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {family.length < 8 && (
        <button type="button" className="secondary" onClick={() => onChange([...family, { name: "", emoji: "🙂" }])}>
          + Someone else
        </button>
      )}
    </Fold>
  );
}

const KINDS: { id: Mine["category"]; name: string }[] = [
  { id: "things", name: "Everyday things" },
  { id: "animals", name: "Animals" },
  { id: "vehicles", name: "Things that go" },
];

/** Their own pictures: his real cup, the dog, the car. He learns words from the things he sees every day. */
export function MyPictures({ mine, onChange }: { mine: Mine[]; onChange: (m: Mine[]) => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const set = (i: number, m: Partial<Mine>) => onChange(mine.map((x, j) => (j === i ? { ...x, ...m } : x)));
  const add = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    try {
      const photo = await smallPhoto(file);
      onChange([...mine, { id: Math.random().toString(36).slice(2, 10), word: "", category: "things", photo, sound: "" }]);
    } catch {
      setProblem("Couldn't read that photo. Try another.");
    }
  };
  return (
    <Fold title="Your own pictures" note={`${mine.length} added`}>
      <p className="fine">Take photos of his real things (his cup, the dog, Daddy's truck) and name them. They show up with the kind you choose, and always among the few.</p>
      <ul className="pk-list pk-mine">
        {mine.map((m, i) => (
          <li key={m.id}>
            <img className="pk-thumb pk-thumb-big" src={m.photo} alt="" />
            <div className="pk-mine-fields">
              <input type="text" value={m.word} maxLength={24} placeholder="What is it? (Cup)" onChange={(e) => set(i, { word: e.target.value })} aria-label="What it's called" />
              <input type="text" value={m.sound ?? ""} maxLength={40} placeholder="What it says (optional)" onChange={(e) => set(i, { sound: e.target.value })} aria-label="What it says or does" />
              <select value={m.category} onChange={(e) => set(i, { category: e.target.value as Mine["category"] })} aria-label="Which kind">
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="secondary" aria-label={`Remove ${m.word || "this picture"}`} onClick={() => onChange(mine.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {problem && <p className="fine pk-problem">{problem}</p>}
      {mine.length < 40 && (
        <label className="secondary pk-file-button">
          📷 Add a photo
          <input type="file" accept="image/*" onChange={(e) => void add(e.target.files?.[0]).then(() => (e.target.value = ""))} />
        </label>
      )}
    </Fold>
  );
}

/** His words: the ones being practised (shown more often), and a diary of the first time he said each. */
export function WordsDiary({ words, things, onChange }: { words: Words; things: Thing[]; onChange: (w: Words) => void }) {
  const [typed, setTyped] = useState("");
  const said = (word: string) => words.said.find((s) => s.word.toLowerCase() === word.toLowerCase());
  const diary = [...words.said].sort((a, b) => a.at - b.at);
  return (
    <Fold title="His words" note={`${words.said.length} said`}>
      <p className="fine">⭐ a word to practise it: it comes up more often. When he says one, tap 🎉 and it goes in his diary with the day.</p>
      <ul className="pk-list">
        {things.map((th) => {
          const s = said(th.word);
          return (
            <li key={th.id}>
              <span className="pk-list-name">
                <Thumb thing={th} /> {th.word}
              </span>
              {s ? (
                <span className="pk-said">🎉 {when(s.at)}</span>
              ) : (
                <>
                  <button type="button" className={`secondary${words.practice.includes(th.id) ? " pk-star-on" : ""}`} aria-pressed={words.practice.includes(th.id)} aria-label={`Practise ${th.word}`} onClick={() => onChange(togglePractice(words, th.id))}>
                    {words.practice.includes(th.id) ? "⭐" : "☆"}
                  </button>
                  <button type="button" className="secondary" onClick={() => onChange(heSaid(words, th.word, th.id))}>
                    🎉 He said it
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className="pk-row"
        onSubmit={(e) => {
          e.preventDefault();
          onChange(heSaid(words, typed));
          setTyped("");
        }}
      >
        <input type="text" value={typed} maxLength={30} placeholder="Another word he said (uh-oh, more…)" onChange={(e) => setTyped(e.target.value)} aria-label="A word he said" className="pk-grow" />
        <button type="submit" className="secondary" disabled={!typed.trim()}>
          Add
        </button>
      </form>
      {diary.length > 0 && (
        <>
          <h4 className="pk-sub">His first words</h4>
          <ol className="pk-diary">
            {diary.map((s, i) => (
              <li key={s.word}>
                <span className="pk-diary-n">{i + 1}</span> <strong>{s.word}</strong> <span className="fine">{when(s.at)}</span>
                <button type="button" className="pk-link-button" aria-label={`Take ${s.word} out of the diary`} onClick={() => onChange(unsay(words, s.word))}>
                  ✕
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </Fold>
  );
}

/** The photos of his face as he played: kept on this device, to share or save. */
export function Album({ version, open }: { version: number; open?: boolean }) {
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [looking, setLooking] = useState<Snap | null>(null);
  useEffect(() => void album().then(setSnaps), [version]);
  const urls = useMemo(() => new Map(snaps.map((s) => [s.id, URL.createObjectURL(s.photo)])), [snaps]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const share = async (s: Snap) => {
    const file = new File([s.photo], `peekaboo-${new Date(s.at).toISOString().slice(0, 10)}.jpg`, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) return void navigator.share({ files: [file], title: s.caption }).catch(() => {});
    const a = document.createElement("a");
    a.href = urls.get(s.id)!;
    a.download = file.name;
    a.click();
  };
  return (
    <Fold title="Album" note={`${snaps.length} photo${snaps.length === 1 ? "" : "s"}`} open={open}>
      <p className="fine">Snapshots of his face while he plays: turn on "Take his photo" above, or tap 📸 on the other phone during a call. They stay on this device.</p>
      {snaps.length ? (
        <div className="pk-album">
          {snaps.map((s) => (
            <button key={s.id} type="button" className="pk-album-item" onClick={() => setLooking(s)} aria-label={`${s.caption}, ${when(s.at)}`}>
              <img src={urls.get(s.id)} alt="" />
            </button>
          ))}
        </div>
      ) : (
        <p className="fine">No photos yet.</p>
      )}
      {looking && (
        <div className="pk-viewer" role="dialog" aria-modal="true" aria-label={looking.caption}>
          <img src={urls.get(looking.id)} alt={looking.caption} />
          <p>
            {looking.caption} · {when(looking.at)}
          </p>
          <div className="pk-row">
            <button type="button" className="secondary" onClick={() => void share(looking)}>
              {"canShare" in navigator ? "Share" : "Save"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void dropSnap(looking.id).then(() => {
                  setSnaps((all) => all.filter((x) => x.id !== looking.id));
                  setLooking(null);
                })
              }
            >
              Delete
            </button>
            <button type="button" className="secondary" onClick={() => setLooking(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </Fold>
  );
}

/** The surprise box: a link for Grammi (or anyone they choose) to send him surprises from her own phone. */
export function SurpriseBox({ box, onBox }: { box: Box | null; onBox: (b: Box | null) => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const make = async (old: Box | null) => {
    setProblem(null);
    const r = await fetch("/surprises/boxes", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
    if (!r?.ok) return setProblem("Couldn't make a link: the surprise box needs the internet and the parlor's server.");
    const made = (await r.json()) as Box;
    // The old link stops working (the surprises in it can still be opened on this device).
    if (old) void fetch(`/surprises/boxes/${old.box}/close`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: old.key }) }).catch(() => {});
    saveBox(made);
    onBox(made);
  };
  const link = box ? sendLink(box.box) : "";
  const share = async () => {
    if (typeof navigator.share === "function") return void navigator.share({ title: "Send him a surprise", text: "Send a surprise to Peekaboo: a picture and a message in your voice. It waits until he plays.", url: link }).catch(() => {});
    await navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Fold title="Surprise box (for Grammi)" note={box ? "Link made" : undefined}>
      <p className="fine">Give Grammi this link. From her own phone, whenever she likes, she picks a picture or photo and records a message. Next time he plays, a present wiggles on his screen; he taps it, and out comes her surprise in her voice. She can see when he opened it.</p>
      {box ? (
        <>
          <input className="pk-link" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="The link for sending surprises" />
          <div className="pk-row">
            <button type="button" className="secondary" onClick={() => void share()}>
              {copied ? "Copied" : typeof navigator.share === "function" ? "Share the link" : "Copy the link"}
            </button>
            <ShareQr url={link} label="A QR code for sending surprises" what="Point her phone's camera at it" />
            <button type="button" className="secondary" onClick={() => void make(box)}>
              New link (the old one stops working)
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="secondary" onClick={() => void make(null)}>
          🎁 Make a link for Grammi
        </button>
      )}
      {problem && <p className="fine pk-problem">{problem}</p>}
    </Fold>
  );
}

/** Pictures someone can send as a surprise: everything but the family and the grown-ups' own. */
export const SENDABLE = THINGS;
export const restoreBox = loadBox;
