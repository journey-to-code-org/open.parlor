import { useCallback, useEffect, useRef, useState } from "react";
import { play } from "./feedback/sounds";
import { houses, type HouseChat } from "./housesApi";
import { useOnline } from "./offline";

/** How often the page asks whether anything was said, while it is being looked at. */
const ASK_EVERY = 4000;

/** "3:42 PM" today, "Mon 3:42 PM" this week, "Nov 3" before that. */
export function when(at: number, now = Date.now()): string {
  const then = new Date(at);
  const time = then.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (then.toDateString() === new Date(now).toDateString()) return time;
  if (now - at < 6 * 86_400_000) return `${then.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return then.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * The house's own chat, on its page: one conversation for everyone in the house, whichever table
 * they are at. The server keeps it (housechat.ts); this asks for what is new every few seconds.
 */
export function HouseChatBlock({ slug }: { slug: string }) {
  const [chat, setChat] = useState<HouseChat | null>(null);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const online = useOnline();
  const list = useRef<HTMLOListElement>(null);
  const rev = useRef<number | undefined>(undefined);
  const heard = useRef<number | null>(null);

  const show = useCallback((next: HouseChat) => {
    rev.current = next.rev;
    setChat(next);
  }, []);

  useEffect(() => {
    rev.current = undefined;
    heard.current = null;
    setChat(null);
    let gone = false;
    const ask = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const found = await houses.chat(slug, rev.current);
        if (!gone && "messages" in found) show(found);
      } catch {
        /* out of reach for now: the next ask will tell */
      }
    };
    void ask();
    const tick = setInterval(ask, ASK_EVERY);
    document.addEventListener("visibilitychange", ask);
    return () => {
      gone = true;
      clearInterval(tick);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [slug, show]);

  // New messages: a pop for someone else's, and the list follows them down unless the reader has
  // scrolled back up through the older ones.
  const newest = chat?.messages.at(-1);
  useEffect(() => {
    if (!chat) return;
    const before = heard.current;
    heard.current = newest?.id ?? 0;
    const box = list.current;
    if (!box) return;
    if (before === null) {
      box.scrollTop = box.scrollHeight;
      return;
    }
    if (!newest || newest.id <= before) return;
    if (!newest.mine) play("message");
    const last = box.lastElementChild as HTMLElement | null;
    if (newest.mine || box.scrollHeight - box.scrollTop - box.clientHeight < (last?.offsetHeight ?? 0) + 80) box.scrollTop = box.scrollHeight;
  }, [chat, newest]);

  async function attempt(work: () => Promise<HouseChat>, after?: () => void) {
    setSending(true);
    try {
      show(await work());
      setProblem(null);
      after?.();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const text = draft.trim();
  return (
    <section className="house-block" aria-label="House chat">
      <h2>House chat</h2>
      <div className="house-chat">
        <ol className="chat-list" ref={list} aria-live="polite">
          {!chat && <li className="empty">{online ? "Opening the chat…" : "The chat needs a connection."}</li>}
          {chat?.messages.length === 0 && <li className="empty">{chat.others > 0 ? "Nobody has said anything yet. Say hi to the house." : "Nobody else is here yet. Leave a note for when they are."}</li>}
          {chat?.messages.map((m) => (
            <li key={m.id} className={m.mine ? "mine" : ""}>
              <span className="who">
                {m.name}
                <time className="when" dateTime={new Date(m.at).toISOString()}>
                  {when(m.at)}
                </time>
              </span>
              <span className="text">{m.text}</span>
              {(m.mine || chat.canRemove) && (
                <button type="button" className="link take-down" disabled={sending} onClick={() => confirm(m.mine ? "Take your message down?" : `Take down what ${m.name} said?`) && void attempt(() => houses.unsay(slug, m.id))}>
                  Take down
                </button>
              )}
            </li>
          ))}
        </ol>
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (text) void attempt(() => houses.say(slug, text), () => setDraft(""));
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={chat?.limit ?? 280} placeholder="Say something to the house…" enterKeyHint="send" aria-label="Message to the house" disabled={!chat || !online} />
          <button type="submit" className="primary small" disabled={!text || sending || !chat || !online}>
            Send
          </button>
        </form>
        {problem && <p className="error">{problem}</p>}
      </div>
    </section>
  );
}
