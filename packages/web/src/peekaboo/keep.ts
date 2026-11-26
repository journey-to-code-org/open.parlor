// What the grown-ups keep: the photo album (snapshots of his face as he plays), the words diary
// (the words he's practising and the day he first said each one), and the surprise box's key.
import { inStore, loadJson, saveJson } from "./store";

// The album.
export interface Snap {
  id: string;
  at: number;
  caption: string;
  photo: Blob;
}

export async function keepSnap(photo: Blob, caption: string, at = Date.now()): Promise<Snap> {
  const snap = { id: `${at}-${Math.random().toString(36).slice(2, 7)}`, at, caption: caption.slice(0, 80), photo };
  await inStore("album", "readwrite", (s) => s.put(snap, snap.id));
  return snap;
}
export async function album(): Promise<Snap[]> {
  const all = ((await inStore("album", "readonly", (s) => s.getAll()).catch(() => [])) as Snap[]) ?? [];
  return all.filter((s) => s && s.photo instanceof Blob).sort((a, b) => b.at - a.at);
}
export const dropSnap = (id: string) => inStore("album", "readwrite", (s) => s.delete(id));

export const when = (at: number) => new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * A photo from a video: the frame as it is now, with a caption across the foot ("Found the cow!
 * · Nov 26, 2026"). Null when the video has no picture yet.
 */
export async function frame(video: HTMLVideoElement | null, caption: string, mirror = false): Promise<Blob | null> {
  if (!video || !video.videoWidth) return null;
  const w = Math.min(960, video.videoWidth);
  const h = Math.round((video.videoHeight / video.videoWidth) * w);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  if (mirror) {
    g.translate(w, 0);
    g.scale(-1, 1);
  }
  g.drawImage(video, 0, 0, w, h);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const band = Math.round(h * 0.12);
  g.fillStyle = "rgba(30, 26, 60, 0.6)";
  g.fillRect(0, h - band, w, band);
  g.fillStyle = "#fff";
  g.font = `700 ${Math.round(band * 0.45)}px ui-rounded, system-ui, sans-serif`;
  g.textBaseline = "middle";
  g.fillText(`${caption} · ${when(Date.now())}`, band * 0.4, h - band / 2, w - band * 0.8);
  return new Promise((yes) => canvas.toBlob((b) => yes(b), "image/jpeg", 0.85));
}

// The words diary.
export interface SaidWord {
  word: string;
  /** The picture it goes with, when there is one. */
  id?: string;
  at: number;
}
export interface Words {
  said: SaidWord[];
  /** Pictures whose words are being practised: shown more often, and always among the few. */
  practice: string[];
}
const WORDS_KEY = "peekaboo.words";
export function tidyWords(raw: unknown): Words {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const said = (Array.isArray(r.said) ? r.said : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({ word: String(s.word ?? "").replace(/\s+/g, " ").trim().slice(0, 30), ...(typeof s.id === "string" ? { id: s.id.slice(0, 40) } : {}), at: Number(s.at) || 0 }))
    .filter((s) => s.word && s.at)
    .slice(0, 500);
  const practice = (Array.isArray(r.practice) ? r.practice : []).filter((p): p is string => typeof p === "string").slice(0, 20);
  return { said, practice };
}
export const loadWords = () => loadJson(WORDS_KEY, tidyWords);
export const saveWords = (w: Words) => saveJson(WORDS_KEY, w);

/** He said a word: kept with the day, the first time only (the diary is of first words). */
export function heSaid(words: Words, word: string, id?: string, at = Date.now()): Words {
  const clean = word.replace(/\s+/g, " ").trim().slice(0, 30);
  if (!clean || words.said.some((s) => s.word.toLowerCase() === clean.toLowerCase())) return words;
  // Once he says it, it isn't one to practise any more.
  return { said: [...words.said, { word: clean, ...(id ? { id } : {}), at }], practice: id ? words.practice.filter((p) => p !== id) : words.practice };
}
export const unsay = (words: Words, word: string): Words => ({ ...words, said: words.said.filter((s) => s.word !== word) });
export const togglePractice = (words: Words, id: string): Words => ({ ...words, practice: words.practice.includes(id) ? words.practice.filter((p) => p !== id) : [...words.practice, id].slice(-20) });

// The surprise box: this device's box, made once.
export interface Box {
  box: string;
  key: string;
}
const BOX_KEY = "peekaboo.box";
export const loadBox = () => loadJson<Box | null>(BOX_KEY, (r) => (r && typeof r === "object" && typeof (r as Box).box === "string" && typeof (r as Box).key === "string" ? (r as Box) : null));
export const saveBox = (b: Box | null) => saveJson(BOX_KEY, b);
export const sendLink = (box: string) => {
  const url = new URL(location.href);
  url.search = "?peekaboo=send";
  url.hash = box;
  return url.href;
};
