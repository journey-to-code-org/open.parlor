// Peekaboo's voice: what names each picture (a grown-up's own recording when there is one, the
// device's speech otherwise). The sound effects are sfx.ts.
// Recordings are kept in this browser (IndexedDB) and never leave it.
import { inStore } from "./store";
import { DEFAULT_FAMILY, tidySettings, type Person, type Settings } from "./things";

export { audioContext, sounds } from "./sfx";

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
  const ended = await sayAnd(text, key);
  void ended;
}

/** Say something, and know when it has finished being said. */
export async function sayAnd(text: string, key?: string): Promise<Promise<void>> {
  playing?.pause();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  const clip = key ? await recording(key).catch(() => null) : null;
  if (clip) {
    const url = URL.createObjectURL(clip);
    playing = new Audio(url);
    const clip_ = playing;
    const over = new Promise<void>((done) => {
      clip_.addEventListener("ended", () => (URL.revokeObjectURL(url), done()), { once: true });
      clip_.addEventListener("pause", () => done(), { once: true });
    });
    await clip_.play().catch(() => {});
    return over;
  }
  if (typeof speechSynthesis === "undefined") return Promise.resolve();
  const words = new SpeechSynthesisUtterance(text);
  words.rate = 0.85;
  words.pitch = 1.25;
  const v = voice();
  if (v) words.voice = v;
  const over = new Promise<void>((done) => {
    words.onend = () => done();
    words.onerror = () => done();
  });
  speechSynthesis.speak(words);
  return over;
}

/** Play a sound (a recorded message, say) from a data URL; resolves when it ends. */
export function playData(url: string): Promise<void> {
  quiet();
  playing = new Audio(url);
  const clip = playing;
  return new Promise<void>((done) => {
    clip.addEventListener("ended", () => done(), { once: true });
    clip.addEventListener("pause", () => done(), { once: true });
    clip.addEventListener("error", () => done(), { once: true });
    void clip.play().catch(() => done());
  });
}

/** A blob as a data URL, for sending. */
export const dataUrl = (blob: Blob) =>
  new Promise<string>((yes, no) => {
    const reader = new FileReader();
    reader.onload = () => yes(String(reader.result));
    reader.onerror = () => no(reader.error);
    reader.readAsDataURL(blob);
  });

export function quiet() {
  playing?.pause();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

// Recordings: one clip per picture, keyed by the picture's id (and a sung verse by "song:" and its id).
const store = <T,>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>) => inStore<T>("voices", mode, act);
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

/** Record from the microphone until `stop` is called (or `most` milliseconds pass). */
export async function record(most = 10_000): Promise<{ stop(): Promise<Blob>; done: Promise<Blob> }> {
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
  const timer = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), most);
  return {
    done,
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

/** A photo, made small (a square, 320 pixels by default) so it keeps in the browser and goes across a call. */
export async function smallPhoto(file: Blob, size = 320): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}
