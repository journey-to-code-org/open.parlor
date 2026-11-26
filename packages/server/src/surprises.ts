// Peekaboo's surprise box: a grandparent (or anyone with the link) sends the baby a surprise from
// their own phone, whenever they like: a picture or photo, and a message in their own voice. Next
// time the baby plays, a present wiggles on the screen; a tap opens it. The sender can see when it
// was opened.
//
//   surprises/box-<box>   server only: the box's secret key (its owner's, the baby's device), when made
//   surprises/s-<id>      server only: one surprise: its box, who sent it, the picture or photo, the
//                         message, when it was sent and opened
//
//   POST /surprises/boxes                    a new box: its id (for the senders' link) and its key
//   GET  /surprises/boxes/<box>?key=…        the surprises waiting to be opened
//   POST /surprises/boxes/<box>/<id>/opened  { key }: one was opened
//   POST /surprises/boxes/<box>/close        { key }: the senders' link stops working
//   POST /surprises/<box>                    { from, sender, picture?, photo?, audio?, note? }: send one
//   GET  /surprises/<box>/sent?sender=…      what this sender sent, and whether each has been opened
//
// The link is the permission to send: the box's owner makes a new box to stop an old link working.
// An opened surprise's photo and message are let go after a week; what it was and when stays.

interface Sync {
  write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown>;
  documents(): Promise<{
    get(collection: string, key: string): Record<string, unknown> | undefined;
    all(collection: string, prefix?: string): Array<{ key: string } & Record<string, unknown>>;
  }>;
}

export interface SurpriseDoc {
  id: string;
  box: string;
  from: string;
  sender: string;
  picture: string;
  photo: string;
  audio: string;
  note: string;
  sent: number;
  opened: number;
}

const LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";
const random = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => LETTERS[b % LETTERS.length]).join("");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clean = (text: unknown, max: number) => String(text ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

export const WAITING_LIMIT = 20;
export const PHOTO_LIMIT = 200_000;
export const AUDIO_LIMIT = 450_000;
const SEND_GAP_MS = 4000;
const KEEP_OPENED_MS = 7 * 24 * 60 * 60_000;
const DATA = /^data:(image\/(jpeg|png|webp)|audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav))(;[a-z0-9=.+-]+)*;base64,[A-Za-z0-9+/=]+$/;

export function createSurprises(sync: Sync, { now = () => Date.now() }: { now?: () => number } = {}) {
  const docs = sync.documents();
  const lastSent = new Map<string, number>();

  const box = async (id: string) => (await docs).get("surprises", `box-${id}`) as { secret?: string; closed?: boolean } | undefined;
  const ofBox = async (id: string) => ((await docs).all("surprises", "s-") as unknown as SurpriseDoc[]).filter((s) => s.box === id);
  const owns = async (id: string, key: unknown) => {
    const b = await box(id);
    return !!b?.secret && typeof key === "string" && key === b.secret;
  };
  /** Let go of the photos and messages of surprises opened more than a week ago. */
  const tidy = async (list: SurpriseDoc[]) => {
    for (const s of list) if (s.opened && now() - s.opened > KEEP_OPENED_MS && (s.photo || s.audio)) await sync.write("surprises", `s-${s.id}`, { photo: "", audio: "" });
  };

  return {
    /** Answers /surprises requests; null for anything else. */
    async fetch(request: Request): Promise<Response | null> {
      const url = new URL(request.url);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] !== "surprises") return null;
      const input = request.method === "POST" ? (((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>) : {};

      // The baby's device.
      if (parts[1] === "boxes") {
        if (parts.length === 2 && request.method === "POST") {
          let id = random(10);
          while (await box(id)) id = random(10);
          const key = random(24);
          await sync.write("surprises", `box-${id}`, { secret: key, made: now() });
          return json({ box: id, key }, 201);
        }
        const id = String(parts[2] ?? "");
        const key = request.method === "GET" ? url.searchParams.get("key") : input.key;
        if (!(await owns(id, key))) return json({ error: "That surprise box isn't this device's." }, 403);
        if (parts.length === 3 && request.method === "GET") {
          const all = await ofBox(id);
          void tidy(all);
          const waiting = all.filter((s) => !s.opened).sort((a, b) => a.sent - b.sent);
          return json({ waiting: waiting.map(({ id, from, picture, photo, audio, note, sent }) => ({ id, from, picture, photo, audio, note, sent })) });
        }
        // A new link for the senders: this box stops taking surprises (the ones in it can still be opened).
        if (parts.length === 4 && parts[3] === "close" && request.method === "POST") {
          await sync.write("surprises", `box-${id}`, { closed: true });
          return json({ ok: true });
        }
        if (parts.length === 5 && parts[4] === "opened" && request.method === "POST") {
          const s = (await docs).get("surprises", `s-${parts[3]}`) as SurpriseDoc | undefined;
          if (!s || s.box !== id) return json({ error: "No such surprise" }, 404);
          if (!s.opened) await sync.write("surprises", `s-${s.id}`, { opened: now() });
          return json({ ok: true });
        }
        return json({ error: "Not found" }, 404);
      }

      // A sender's phone.
      const id = String(parts[1] ?? "");
      const b = await box(id);
      if (!b?.secret || b.closed) return json({ error: "That surprise link doesn't work any more. Ask for a new one." }, 404);
      if (parts.length === 3 && parts[2] === "sent" && request.method === "GET") {
        const sender = clean(url.searchParams.get("sender"), 40);
        if (!sender) return json({ sent: [] });
        const mine = (await ofBox(id)).filter((s) => s.sender === sender).sort((a, b) => b.sent - a.sent).slice(0, 30);
        return json({ sent: mine.map(({ id, picture, note, sent, opened, photo }) => ({ id, picture, note, sent, opened, photo: !!photo })) });
      }
      if (parts.length === 2 && request.method === "POST") {
        const from = clean(input.from, 24);
        const sender = clean(input.sender, 40);
        const picture = clean(input.picture, 40);
        const note = clean(input.note, 120);
        const photo = typeof input.photo === "string" ? input.photo : "";
        const audio = typeof input.audio === "string" ? input.audio : "";
        if (!from) return json({ error: "Say who it's from." }, 400);
        if (!sender) return json({ error: "Update the page and try again." }, 400);
        if (!picture && !photo) return json({ error: "Pick a picture or a photo." }, 400);
        if (photo && (photo.length > PHOTO_LIMIT || !DATA.test(photo) || !photo.startsWith("data:image/"))) return json({ error: "That photo can't be sent. Try another." }, 400);
        if (audio && (audio.length > AUDIO_LIMIT || !DATA.test(audio) || !audio.startsWith("data:audio/"))) return json({ error: "That message is too long. Keep it under about twenty seconds." }, 400);
        const last = lastSent.get(sender) ?? 0;
        if (now() - last < SEND_GAP_MS) return json({ error: "Just a moment before sending another." }, 429);
        if ((await ofBox(id)).filter((s) => !s.opened).length >= WAITING_LIMIT) return json({ error: "The box is full: let him open some first." }, 429);
        lastSent.set(sender, now());
        const doc: SurpriseDoc = { id: random(12), box: id, from, sender, picture, photo, audio, note, sent: now(), opened: 0 };
        await sync.write("surprises", `s-${doc.id}`, doc as unknown as Record<string, unknown>);
        return json({ id: doc.id }, 201);
      }
      return json({ error: "Not found" }, 404);
    },
  };
}
