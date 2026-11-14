// Offers at a board: resigning, a draw by agreement, a move taken back (packages/games/src/offers.ts).
// The view says what is open and what this seat may do; this draws it, once, for every board game:
// a small menu in the bar for the things a player rarely does, and a banner by the board when there
// is an offer to answer or one of yours waiting for an answer.
import type { BoardOffers, OfferKind, OfferMove } from "@cardroom/games";
import { useEffect, useRef, useState } from "react";
import { play } from "../feedback/sounds";

type Send = (move: OfferMove) => void;

const MENU_WORDS: Record<OfferKind, string> = { draw: "Offer a draw", takeback: "Ask to take a move back", resign: "Resign…" };
const MENU_ICONS: Record<OfferKind, string> = { draw: "🤝", takeback: "↩", resign: "⚑" };
/** The order they're listed in: the gentlest first, and resigning last, away from the others. */
const MENU_ORDER: OfferKind[] = ["draw", "takeback", "resign"];

/**
 * The ⚑ in the bar and its menu. Only what the view says this seat can do now is listed, and when
 * that is nothing (the game is over, or you're watching) there is no button at all. Resigning asks
 * again before it is sent, so a slip of the thumb can't lose a game.
 */
export function OffersMenu({ can, onSend }: { can: OfferKind[]; onSend: Send }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const items = MENU_ORDER.filter((kind) => can.includes(kind));
  const close = (refocus = true) => {
    setOpen(false);
    setConfirming(false);
    if (refocus) toggle.current?.focus();
  };

  // Open: the first thing in it has the focus. A press anywhere else puts it away.
  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>(confirming ? "[data-keep]" : "[role=menuitem]")?.focus();
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && close(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, confirming]);
  // The game moved on under an open menu (it ended, say): nothing listed can be trusted.
  const key = items.join();
  useEffect(() => {
    if (open && !items.length) close(false);
  }, [key]);

  if (!items.length) return null;

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      // Not the table's Escape as well (it puts down a piece in hand).
      e.stopPropagation();
      return close();
    }
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step && e.key !== "Home" && e.key !== "End") return;
    const all = [...(wrap.current?.querySelectorAll<HTMLElement>(".offers-pop button") ?? [])];
    if (!all.length) return;
    e.preventDefault();
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (at + step + all.length) % all.length]!.focus();
  }

  const choose = (kind: OfferKind) => {
    if (kind === "resign") return setConfirming(true);
    close();
    onSend({ type: "offer", offer: kind });
  };

  return (
    <span className="offers-menu" ref={wrap} onKeyDown={open ? onKey : undefined}>
      <button
        ref={toggle}
        type="button"
        className="settings-toggle offers-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Game menu: ${items.map((kind) => MENU_WORDS[kind].replace("…", "").toLowerCase()).join(", ")}`}
        title="Resign, offer a draw, take a move back"
        onClick={() => (open ? close() : setOpen(true))}
      >
        ⚑
      </button>
      {open &&
        (confirming ? (
          <div className="offers-pop confirm" role="alertdialog" aria-label="Resign this game?" aria-describedby="offers-confirm-note">
            <strong>Resign this game?</strong>
            <span id="offers-confirm-note">The other player wins it. This can't be undone.</span>
            <div className="offers-row">
              <button type="button" className="secondary" data-keep onClick={() => close()}>
                Keep playing
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  close();
                  onSend({ type: "resign" });
                }}
              >
                Yes, resign
              </button>
            </div>
          </div>
        ) : (
          <div className="offers-pop" role="menu" aria-label="Game menu">
            {items.map((kind) => (
              <button key={kind} type="button" role="menuitem" className={kind === "resign" ? "danger" : undefined} onClick={() => choose(kind)}>
                <span aria-hidden>{MENU_ICONS[kind]}</span>
                {MENU_WORDS[kind]}
              </button>
            ))}
          </div>
        ))}
    </span>
  );
}

/** What an open offer asks, as seen from each chair. */
function words(offers: BoardOffers, names: string[], me: number, watching: boolean): string | null {
  const open = offers.open;
  if (!open) return null;
  const by = names[open.by] ?? `Seat ${open.by + 1}`;
  const to = names[1 - open.by] ?? `Seat ${2 - open.by}`;
  const draw = open.kind === "draw";
  if (watching) return draw ? `${by} has offered ${to} a draw.` : `${by} has asked ${to} to take a move back.`;
  if (offers.answer) return draw ? `${by} offers a draw.` : `${by} asks to take their last move back.`;
  if (open.by === me) return draw ? `You offered a draw. Waiting for ${to}…` : `You asked to take your move back. Waiting for ${to}…`;
  return null;
}

/**
 * By the board while an offer is open: Accept and Decline for the player it was made to, a line
 * that says it is waiting for the player who made it, and the bare fact for anyone watching.
 * Underneath, a note when an offer of yours was played through instead of answered.
 */
export function OfferBanner({ offers, names, me, watching, onSend }: { offers: BoardOffers; names: string[]; me: number; watching: boolean; onSend: Send }) {
  const mine = offers.answer && !watching;
  const text = words(offers, names, me, watching);
  const last = offers.last;

  // An offer for you is something to notice: the sound and buzz of "your turn". A "no" to one of
  // yours is the sound of a move refused. (A move taken back moves the pieces, which has its own.)
  const openKey = offers.open ? `${offers.open.kind}/${offers.open.by}` : "";
  const heard = useRef(openKey);
  useEffect(() => {
    if (openKey && openKey !== heard.current && mine) play("yourTurn");
    heard.current = openKey;
  }, [openKey, mine]);
  const lastKey = last ? `${last.kind}/${last.by}/${last.outcome}` : "";
  const told = useRef(lastKey);
  useEffect(() => {
    if (lastKey !== told.current && last?.outcome === "declined" && last.by === me && !watching) play("nope");
    told.current = lastKey;
  }, [lastKey]);

  const lapsed = last?.outcome === "lapsed" && last.kind !== "resign" ? last : null;
  const lapsedBy = lapsed ? (lapsed.by === me && !watching ? "Your" : `${names[lapsed.by] ?? `Seat ${lapsed.by + 1}`}'s`) : "";
  if (!text && !lapsed) return null;
  return (
    <>
      {text && (
        <div className={`offer-banner${mine ? " asks" : ""}`} role="group" aria-label={mine ? "An offer to answer" : "An offer waiting for an answer"}>
          <p>{text}</p>
          {mine && (
            <div className="offers-row">
              <button type="button" className="primary" onClick={() => onSend({ type: "accept" })}>
                Accept
              </button>
              <button type="button" className="secondary" onClick={() => onSend({ type: "decline" })}>
                Decline
              </button>
            </div>
          )}
        </div>
      )}
      {lapsed && <p className="offer-note">{lapsed.kind === "draw" ? `${lapsedBy} draw offer wasn't taken up: play went on.` : `${lapsedBy} request to take a move back lapsed: play went on.`}</p>}
    </>
  );
}
