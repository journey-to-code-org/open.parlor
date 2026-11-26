// Peekaboo's sounds: the voice that names each picture (a grown-up's own recording when there is
// one, the device's speech otherwise), a pop when a picture appears and a little tune for a find.
// Recordings are kept in this browser (IndexedDB) and never leave it.
import { DEFAULT_FAMILY, tidySettings, type Person, type Settings } from "./things";

let audio: AudioContext | null = null;
const context = () => {
  if (!audio) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
  }
  if (audio.state === "suspended") void audio.resume().catch(() => {});
  return audio;
};

function tone(freq: number, start: number, length: number, type: OscillatorType = "sine", volume = 0.18, slideTo?: number) {
  const ctx = context();
  if (!ctx) return;
  const at = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + length);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

export const sounds = {
  /** A soft bubble pop, a little higher or lower each time. */
  pop() {
    const base = 380 + Math.random() * 260;
    tone(base, 0, 0.18, "sine", 0.2, base * 2.2);
  },
  /** Three rising notes: you found it. */
  cheer() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.28, "triangle", 0.16));
  },
  /** A gentle "boop" for a try that wasn't it: no buzzer, nothing that sounds like losing. */
  boop() {
    tone(330, 0, 0.22, "sine", 0.12, 260);
  },
  /** A rising swish, for the blanket coming off. */
  swish() {
    tone(200, 0, 0.3, "triangle", 0.1, 900);
  },
};

// The device's own voice, a little slower and higher than usual, as people talk to babies.
let chosen: SpeechSynthesisVoice | null | undefined;
function voice(): SpeechSynthesisVoice | null {
  if (chosen !== undefined) return chosen;
  const all = typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices();
  if (!all.length) return null; // not loaded yet: ask again next time
  const english = all.filter((v) => v.lang.toLowerCase().startsWith("en"));
  chosen = english.find((v) => /samantha|female|zira|google us english/i.test(v.name)) ?? english.find((v) => v.lang === "en-US") ?? english[0] ?? all[0] ?? null;
  return chosen;
}

let playing: HTMLAudioElement | null = null;
/** Say something. With a recording for `key`, that is played instead of the spoken words. */
export async function say(text: string, key?: string): Promise<void> {
  playing?.pause();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  const clip = key ? await recording(key).catch(() => null) : null;
  if (clip) {
    const url = URL.createObjectURL(clip);
    playing = new Audio(url);
    playing.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    await playing.play().catch(() => {});
    return;
  }
  if (typeof speechSynthesis === "undefined") return;
  const words = new SpeechSynthesisUtterance(text);
  words.rate = 0.85;
  words.pitch = 1.25;
  const v = voice();
  if (v) words.voice = v;
  speechSynthesis.speak(words);
}

export function quiet() {
  playing?.pause();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

// Recordings: one clip per picture, keyed by the picture's id.
const DB = "peekaboo";
const STORE = "voices";
function db(): Promise<IDBDatabase> {
  return new Promise((yes, no) => {
    if (typeof indexedDB === "undefined") return no(new Error("No storage here"));
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => yes(open.result);
    open.onerror = () => no(open.error);
  });
}
async function store<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((yes, no) => {
    const req = act(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => yes(req.result);
    req.onerror = () => no(req.error);
  });
}
const cache = new Map<string, Blob | null>();
export async function recording(key: string): Promise<Blob | null> {
  if (cache.has(key)) return cache.get(key)!;
  const got = ((await store("readonly", (s) => s.get(key))) as Blob | undefined) ?? null;
  cache.set(key, got);
  return got;
}
export async function keepRecording(key: string, clip: Blob) {
  await store("readwrite", (s) => s.put(clip, key));
  cache.set(key, clip);
}
export async function dropRecording(key: string) {
  await store("readwrite", (s) => s.delete(key));
  cache.set(key, null);
}
export async function recordedKeys(): Promise<string[]> {
  return ((await store("readonly", (s) => s.getAllKeys()).catch(() => [])) as IDBValidKey[]).map(String);
}

/** Record from the microphone until `stop` is called (or ten seconds pass). */
export async function record(): Promise<{ stop(): Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const recorder = new MediaRecorder(stream);
  const parts: Blob[] = [];
  recorder.addEventListener("dataavailable", (e) => e.data.size && parts.push(e.data));
  const done = new Promise<Blob>((yes) =>
    recorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop());
      yes(new Blob(parts, { type: recorder.mimeType || "audio/webm" }));
    }),
  );
  recorder.start();
  const timer = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 10_000);
  return {
    stop() {
      clearTimeout(timer);
      if (recorder.state !== "inactive") recorder.stop();
      return done;
    },
  };
}

// Settings and the family, kept on this device.
const SETTINGS_KEY = "peekaboo.settings";
const FAMILY_KEY = "peekaboo.family";
export function loadSettings(): Settings {
  try {
    return tidySettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null"));
  } catch {
    return tidySettings(null);
  }
}
export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
export function tidyFamily(raw: unknown): Person[] {
  if (!Array.isArray(raw)) return DEFAULT_FAMILY;
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .slice(0, 8)
    .map((p) => ({
      name: String(p.name ?? "").slice(0, 24),
      emoji: String(p.emoji ?? "🙂").slice(0, 8),
      photo: typeof p.photo === "string" && p.photo.startsWith("data:image/") && p.photo.length < 120_000 ? p.photo : undefined,
    }));
}
export function loadFamily(): Person[] {
  try {
    return tidyFamily(JSON.parse(localStorage.getItem(FAMILY_KEY) ?? "null"));
  } catch {
    return DEFAULT_FAMILY;
  }
}
export function saveFamily(family: Person[]) {
  try {
    localStorage.setItem(FAMILY_KEY, JSON.stringify(family));
  } catch {}
}

/** A photo, made small (a square of 320 pixels) so it keeps in the browser and goes across a call. */
export async function smallPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 320;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 320, 320);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}
