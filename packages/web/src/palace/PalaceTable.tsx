import type { PalaceMove, PalaceView } from "@journey-to-code/palace";
import { cardId, type Card, type TableSettings } from "@journey-to-code/rules";
import { TableSettingsButton } from "../TableSettings";
import { useWants3d } from "../display";
import PalaceSeat from "@open-parlor/ui/palace-seat.zb";
import PlayingCard from "@open-parlor/ui/playing-card.zb";
import { useEffect, useRef, useState } from "react";
import { Bubble, TableChat, useBubbles, type ChatProps } from "../Chat";
import { loadFeedbackSettings, play, saveFeedbackSettings } from "../feedback/sounds";
import { Confetti } from "../Confetti";
import { lift, motionScale, useCardFlip, useFlash } from "../motion";
import { usePalaceFx } from "./PalaceFx";
import { HandSortBar, useHandOrder } from "../HandSort";
import { cardKey } from "../handOrder";
import { SoundButton } from "../SoundButton";

type PCard = Extract<Card, { kind: "pip" }>;
const WORD: Record<number, [string, string]> = { 11: ["jack", "jacks"], 12: ["queen", "queens"], 13: ["king", "kings"], 14: ["ace", "aces"] };
const COUNT = ["", "", "two", "three", "four", "five", "six", "seven", "eight"];
/** "an 8", "a jack", "two 7s", "three aces". */
export function cardsInWords(rank: number, n: number): string {
  const [one, many] = WORD[rank] ?? [String(rank), `${rank}s`];
  if (n > 1) return `${COUNT[n] ?? n} ${many}`;
  return `${rank === 8 || rank === 14 ? "an" : "a"} ${one}`;
}

export interface PalaceTableProps {
  view: PalaceView;
  seat: number;
  names: string[];
  /** Resolves to an error message when the move is refused. */
  act: (move: PalaceMove) => Promise<string | null>;
  onLeave: () => void;
  banner?: React.ReactNode;
  chat?: ChatProps;
  /** Opponents and speed, changeable mid-game. */
  settings?: { value: TableSettings; change: (next: TableSettings) => Promise<void> | void };
  /** Nobody's playing `seat` from here: the table is being watched. */
  watching?: boolean;
}

/** What just happened, in words: "Hank burned it 🔥", "Dot picked up 9". */
function narrate(view: PalaceView, names: string[]): string | null {
  const m = view.last;
  if (!m) return null;
  const who = names[m.seat] ?? "Someone";
  const card = m.cards[0];
  if (m.kind === "pickup") return `${who} picked up ${m.pickedUp}`;
  if (m.kind === "flip" && m.pickedUp) return `${who} flipped ${cardsInWords(card!.rank, 1)}… and picked up ${m.pickedUp}`;
  const what = card ? cardsInWords(card.rank, m.cards.length) : "";
  const blind = m.kind === "flip" ? " blind" : "";
  if (m.burned) return `${who} played ${what}${blind} and burned it 🔥`;
  if (m.again) return `${who} played ${what}${blind}: go again!`;
  return `${who} played ${what}${blind}`;
}

type Area = "left" | "top" | "right";

/**
 * Where everyone else sits, going round the table from your left: one opponent sits across; two
 * sit left and right; three sit left, across and right; more fill in across the top.
 */
export function seatAround(others: number[]): { seat: number; area: Area }[] {
  const n = others.length;
  return others.map((seat, i) => ({ seat, area: n === 1 ? "top" : i === 0 ? "left" : i === n - 1 ? "right" : "top" }));
}

/** Another player: their name, and their face-down and face-up cards on the table in front of them. */
function Opponent(props: { seat: number; area: Area; name: string; up: Card[]; down: number; held: number; active: boolean; place: number; last: boolean }) {
  const { seat, area, up, down } = props;
  const playing = props.place === 0 && !props.last;
  const slots = Math.max(up.length, down);
  return (
    <div className={`opp ${area}`} data-seat={seat}>
      <PalaceSeat name={props.name} up={[]} down={0} held={props.held} active={props.active} place={props.place} last={props.last} compact />
      {playing && slots > 0 && (
        <div className="opp-cards" role="group" aria-label={`${props.name}'s table: ${up.length} face up, ${down} face down`}>
          {Array.from({ length: slots }, (_, i) => (
            <div key={i} className="mini-slot">
              {/* One face-down card with its face-up card on top, turned to face whoever sits there. */}
              <div className="mini-stack">
                {i < down && (
                  <div className="mini-down">
                    <PlayingCard back size="mini" />
                  </div>
                )}
                {up[i] && (
                  <div className="mini-up">
                    <PlayingCard card={up[i]} size="mini" data-flip={cardId(up[i]!)} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Above your hand while a set is picked: play them, take the whole set, or let go. */
function PickedBar(props: { rank: number; count: number; of: string[]; onPlay: () => void; onAll: (ids: string[]) => void; onClear: () => void }) {
  const more = props.count < props.of.length;
  const many = (WORD[props.rank] ?? [String(props.rank), `${props.rank}s`])[1];
  return (
    <div className="play-picked" role="group" aria-label="Cards picked to play">
      <button type="button" className="primary" onClick={props.onPlay}>
        Play {cardsInWords(props.rank, props.count)}
      </button>
      {more && (
        <button type="button" className="secondary" onClick={() => props.onAll(props.of)}>
          All {props.of.length}
        </button>
      )}
      <button type="button" className="link" onClick={props.onClear}>
        Clear
      </button>
      <small>{more ? `Tap more ${many} to add them, then tap the pile or drag one onto it.` : "Tap the pile or drag one onto it to play them."}</small>
    </div>
  );
}

/** Palace at the table: the pile, everyone's face-up cards, your hand. Works for a practice game or a family table. */
export function PalaceTable({ view, seat: me, names, act, onLeave, banner, chat, settings, watching }: PalaceTableProps) {
  const [error, setError] = useState<string | null>(null);
  /** Cards picked to play together: one rank, tapped one by one in the hand (or face-up). */
  const [picked, setPicked] = useState<string[]>([]);
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [faceUp, setFaceUp] = useState<string[]>([]);
  const [soundOn, setSoundOn] = useState(() => loadFeedbackSettings().sound);
  const bubbles = useBubbles(chat?.messages ?? []);
  // A watcher has nothing to lay down: for them this seat is always "ready".
  const mine = watching ? { ...view.players[me]!, ready: true } : view.players[me]!;
  const can = view.can;
  const myTurn = view.phase === "playing" && view.turn === me && !watching;
  /** How many cards to pick for face-up, in the family deal; 0 once they're down. */
  const toChoose = can?.choose ?? 0;
  const choosingUp = view.phase === "swapping" && toChoose > 0 && !mine.ready;
  const others = Array.from({ length: view.seats - 1 }, (_, i) => (me + 1 + i) % view.seats);
  const spots = seatAround(others);
  const top = view.pile[view.pile.length - 1] ?? null;
  const root = useRef<HTMLElement>(null);
  const scale = motionScale(settings?.value.pace);
  const departed = useCardFlip(root, scale);
  const fx = usePalaceFx(view, me, departed, scale, root);
  const breathe = useFlash(myTurn, 700, false) && myTurn;
  const pileRef = useRef<HTMLDivElement>(null);
  const myTableRef = useRef<HTMLDivElement>(null);
  // While choosing, the cards picked so far leave the hand and sit on the table, so each one is
  // in one place only (and dragging the same card twice can't happen).
  const inHand = choosingUp && faceUp.length ? (view.hand as PCard[]).filter((c) => !faceUp.includes(cardId(c))) : view.hand;
  const holding = useHandOrder("palace", inHand, cardId, cardKey, {
    // Drag a card out of your hand: onto the pile to play it, or onto your table to lay it face-up.
    drop: {
      target: () => (choosingUp ? myTableRef.current : myTurn && can?.source === "hand" ? pileRef.current : null),
      accepts: (card) => (choosingUp ? true : !!can?.ranks.includes(card.rank)),
      onDrop: (card) => dropped(card as PCard),
    },
  });
  const last = view.last;
  /** Where a card on the pile came from, if it was just played: someone's seat, or your own table. */
  const pileFrom = (c: Card) => {
    if (!last || !last.cards.some((x) => cardId(x as Card) === cardId(c))) return undefined;
    if (last.seat === me) return last.kind === "flip" ? ".me .my-table" : undefined;
    return `[data-seat="${last.seat}"]`;
  };
  /** New cards in your hand come from the deck, or from the pile when you picked it up. */
  const handFrom = last?.pickedUp && last.seat === me ? ".pile" : ".deck";

  // Sounds and a buzz: cards landing, burns, pickups, your turn.
  const lastKey = JSON.stringify([view.last, view.phase]);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (seen.current === null) {
      seen.current = lastKey;
      return;
    }
    if (seen.current === lastKey) return;
    seen.current = lastKey;
    const m = view.last;
    if (view.phase === "finished") play(view.finished[0] === me ? "won" : view.loser === me ? "lost" : "won");
    else if (m?.burned) play("spadesBroken");
    else if (m?.pickedUp) play(m.seat === me ? "set" : "trickThem");
    else if (m) play("card");
    if (view.phase === "playing" && view.turn === me && m?.seat !== me) {
      play("yourTurn");
    }
  }, [lastKey]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 2500);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => setPicked([]), [view.turn, view.phase, lastKey]);

  const send = async (move: PalaceMove) => {
    setPicked([]);
    const putBack = move.type === "play" ? lift(root.current, move.cards) : () => {};
    const refused = await act(move);
    if (refused) {
      putBack();
      setError(refused);
      play("nope");
    }
  };

  /** The cards of this rank where you're playing from. */
  const sameRank = (rank: number, from: "hand" | "up") => (from === "hand" ? view.hand : (mine.up as PCard[])).filter((c) => c.rank === rank).map(cardId);
  const pickedRank = picked.length ? ([...view.hand, ...(mine.up as PCard[])].find((c) => cardId(c) === picked[0])?.rank ?? null) : null;

  /** Play what's picked (or just this card): the pile was tapped, or a card was dropped on it. */
  function playPicked(extra?: PCard) {
    const ids = extra && !picked.includes(cardId(extra)) ? (pickedRank === extra.rank ? [...picked, cardId(extra)] : [cardId(extra)]) : picked;
    if (ids.length) void send({ type: "play", cards: ids });
  }

  /** A card let go of somewhere off the hand: the pile (play it) or, while choosing, your table. */
  function dropped(card: PCard) {
    if (choosingUp) {
      const id = cardId(card);
      setFaceUp((now) => (now.includes(id) || now.length >= toChoose ? now : [...now, id]));
      return;
    }
    if (!myTurn || can?.source !== "hand") return;
    if (!can.ranks.includes(card.rank)) {
      setError(view.rules.sevenLower && top?.rank === 7 ? "After a 7, play 7 or lower." : "That's lower than the pile.");
      play("nope");
      return;
    }
    playPicked(card);
  }

  /**
   * Tap a card in hand (or face-up, once the hand is gone). The only one of its rank plays at once;
   * one of a set is picked, and more of the same rank can be tapped to go with it before playing.
   */
  function tap(card: PCard, from: "hand" | "up") {
    if (view.phase === "swapping" && toChoose && from === "hand") {
      const id = cardId(card);
      setFaceUp((picked) => (picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < toChoose ? [...picked, id] : picked));
      return;
    }
    if (view.phase === "swapping") {
      if (!view.rules.swap || mine.ready) return;
      if (from === "hand") setSwapFrom(cardId(card) === swapFrom ? null : cardId(card));
      else if (swapFrom) {
        void send({ type: "swap", hand: swapFrom, up: cardId(card) });
        setSwapFrom(null);
      }
      return;
    }
    if (!myTurn || can?.source !== from) return;
    if (!can.ranks.includes(card.rank)) {
      setError(view.rules.sevenLower && top?.rank === 7 ? "After a 7, play 7 or lower." : "That's lower than the pile.");
      play("nope");
      return;
    }
    const id = cardId(card);
    const same = sameRank(card.rank, from);
    // The only one of its rank, or face-up cards that go down one at a time: no picking, it's played.
    if (same.length === 1 || (from === "up" && view.rules.upOneAtATime)) {
      void send({ type: "play", cards: [id] });
      return;
    }
    if (picked.includes(id)) setPicked(picked.filter((x) => x !== id));
    else if (pickedRank === card.rank) setPicked([...picked, id]);
    else setPicked([id]);
  }

  function toggleSound() {
    const next = { ...loadFeedbackSettings(), sound: !soundOn };
    saveFeedbackSettings(next);
    setSoundOn(next.sound);
  }

  const status = error ? (
    <span className="error">{error}</span>
  ) : view.phase === "swapping" ? (
    mine.ready ? "Waiting for everyone to lay down their cards…" : toChoose ? `Pick ${toChoose} cards to lay face-up` : view.rules.swap ? (swapFrom ? "Now tap a face-up card to swap it in" : "Swap any hand card with a face-up card, then tap Ready") : null
  ) : view.phase === "finished" ? null : myTurn ? (
    <span className="mine">{can?.flip ? "Your turn: flip a face-down card" : can?.ranks.length ? "Your turn" : "Nothing plays. Pick up the pile."}</span>
  ) : (
    `${names[view.turn]} is thinking…`
  );

  // In 3-D the felt is a table seen from your chair: tipped back, with the cards lying on it and
  // the pile standing as high as it is deep. It is the same page, laid out in space with CSS, so
  // every card is still the same button it was (see ".palace.three" in styles.css).
  const three = useWants3d("palace");

  const order = [...view.finished, ...(view.loser !== null ? [view.loser] : [])];

  return (
    <main className={`table palace${three ? " three" : ""}`} ref={root}>
      <header className="palace-bar">
        <button type="button" className="leave" aria-label="Leave game" onClick={() => (view.phase === "finished" || confirm("Leave this game?")) && onLeave()}>
          ←
        </button>
        <strong>🏰 {view.rules.name}</strong>
        <span className="bar-buttons">
        {settings && <TableSettingsButton settings={settings.value} onChange={settings.change} depth />}
        <SoundButton on={soundOn} toggle={toggleSound} inline />
        </span>
      </header>
      {banner}

      <div className="felt palace-felt">
        {(["top", "left", "right"] as const).map((area) => (
          <div key={area} className={`opp-area ${area}`}>
            {spots
              .filter((spot) => spot.area === area)
              .map(({ seat: s }) => {
                const p = view.players[s]!;
                return (
                  <Opponent
                    key={s}
                    seat={s}
                    area={area}
                    name={names[s] ?? `Seat ${s + 1}`}
                    up={p.up}
                    down={p.down}
                    held={p.hand}
                    active={view.phase === "playing" && view.turn === s}
                    place={view.loser === s ? 0 : (p.place ?? 0)}
                    last={view.loser === s}
                  />
                );
              })}
          </div>
        ))}

        <div className="center">
          <div className="pile-area" aria-label="The pile">
            <div className="deck" aria-label={`${view.deck} cards left to draw`}>
              {view.deck > 0 ? <PlayingCard back size="table" style={{ "--depth": Math.min(6, Math.ceil(view.deck / 8)) } as React.CSSProperties} /> : <div className="empty-slot">No deck</div>}
              <small>{view.deck} to draw</small>
            </div>
            <div
              className={`pile${picked.length ? " ready" : ""}`}
              ref={pileRef}
              role={picked.length ? "button" : undefined}
              tabIndex={picked.length ? 0 : undefined}
              aria-label={picked.length && pickedRank !== null ? `Play ${cardsInWords(pickedRank, picked.length)} on the pile` : undefined}
              onClick={() => picked.length && playPicked()}
              onKeyDown={(e) => picked.length && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), playPicked())}
            >
              {view.pile.length ? (
                <div className="pile-stack" style={{ "--tall": Math.min(view.pileCount, 36) } as React.CSSProperties}>
                  {view.pile.slice(-3).map((c, i, list) => (
                    <div key={`${cardId(c)}-${view.pileCount - list.length + i}`} className={`pile-card${last?.kind === "flip" && pileFrom(c) ? " flipped" : ""}`} style={{ "--i": i } as React.CSSProperties}>
                      <PlayingCard card={c} size="table" data-flip={cardId(c)} data-from={pileFrom(c)} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-slot">{view.last?.burned ? <span className="burnt">🔥</span> : "Empty pile"}</div>
              )}
              <small>
                {view.pileCount} in the pile{view.burned ? ` · ${view.burned} burned` : ""}
              </small>
            </div>
          </div>

          <div className="center-info">
            <p className="narration" aria-live="polite">
              {narrate(view, names)}
            </p>
            <div className="status" role="status">
              {status}
            </div>
            {view.phase === "swapping" && !mine.ready && toChoose > 0 && (
              <div className="felt-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={faceUp.length !== toChoose}
                  onClick={() => {
                    void send({ type: "choose", cards: faceUp });
                    setFaceUp([]);
                  }}
                >
                  {faceUp.length === toChoose ? "Lay these face-up" : `Pick ${toChoose - faceUp.length} more`}
                </button>
              </div>
            )}
            {view.phase === "swapping" && !mine.ready && !toChoose && (
              <div className="felt-actions">
                <button type="button" className="primary" onClick={() => void send({ type: "ready" })}>
                  Ready to play
                </button>
              </div>
            )}

            {myTurn && can?.pickUp && !picked.length && (
              <div className="felt-actions">
                <button type="button" className={can.ranks.length ? "secondary" : "primary"} onClick={() => void send({ type: "pickup" })}>
                  {can.ranks.length ? (
                    <>
                      Pick up <span className="wide-only">the pile </span>instead ({view.pileCount})
                    </>
                  ) : (
                    `Pick up the pile (${view.pileCount})`
                  )}
                </button>
              </div>
            )}

          </div>
        </div>

        <div className="mine-on-table" data-seat={me}>
          <div className={`my-table${choosingUp ? " drop-up" : ""}`} ref={myTableRef} aria-label="Your table cards">
            {Array.from({ length: Math.max(mine.up.length, mine.down) }, (_, i) => {
              const up = mine.up[i] as PCard | undefined;
              // While choosing, the cards picked so far (tapped or dragged) sit on the face-down ones.
              const chosen = choosingUp ? (view.hand as PCard[]).find((c) => cardId(c) === faceUp[i]) : undefined;
              const flippable = myTurn && can?.flip && i < mine.down;
              return (
                <div key={i} className="table-slot">
                  {i < mine.down && (
                    <div className="down-card">
                      {flippable ? (
                        <button type="button" className="flip" aria-label={`Flip face-down card ${i + 1}`} onClick={() => void send({ type: "flip", index: i })}>
                          <PlayingCard back size="table" />
                        </button>
                      ) : (
                        <PlayingCard back size="table" />
                      )}
                    </div>
                  )}
                  {chosen && !up && (
                    <div className="up-card">
                      <PlayingCard
                        size="table"
                        card={chosen}
                        playable
                        onPick={() => setFaceUp((now) => now.filter((x) => x !== cardId(chosen)))}
                      />
                    </div>
                  )}
                  {up && (
                    <div className="up-card">
                      <PlayingCard
                        size="table"
                        card={up}
                        data-flip={cardId(up)}
                        playable={(view.phase === "swapping" && !!swapFrom) || (myTurn && can?.source === "up")}
                        dim={myTurn && can?.source === "up" && !can.ranks.includes(up.rank)}
                        selected={picked.includes(cardId(up))}
                        onPick={() => tap(up, "up")}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <section className="me">
        {chat && <TableChat {...chat} />}
        {picked.length > 0 && pickedRank !== null ? (
          <PickedBar
            rank={pickedRank}
            count={picked.length}
            of={sameRank(pickedRank, can?.source === "up" ? "up" : "hand")}
            onPlay={() => playPicked()}
            onAll={(ids) => setPicked(ids)}
            onClear={() => setPicked([])}
          />
        ) : (
          <HandSortBar {...holding.bar} />
        )}
        <div
          {...holding.hand}
          className={`hand sortable ${breathe ? "breathe" : ""}`}
          role="group"
          aria-label="Your hand"
          style={{ "--n": inHand.length, ...(inHand.length <= 6 ? { "--strip-max": "calc(var(--card-w) + 8px)" } : {}) } as React.CSSProperties}
        >
          {holding.held.map(({ card, key }, i) => (
            <PlayingCard
              key={key}
              data-flip={cardId(card)}
              data-from={handFrom}
              style={{ "--i": i } as React.CSSProperties}
              card={card}
              playable={(view.phase === "swapping" && (view.rules.swap || toChoose > 0) && !mine.ready) || (myTurn && can?.source === "hand")}
              dim={myTurn && can?.source === "hand" && !can.ranks.includes(card.rank)}
              selected={swapFrom === cardId(card) || faceUp.includes(cardId(card)) || picked.includes(cardId(card))}
              onPick={() => tap(card as PCard, "hand")}
            />
          ))}
          {!view.hand.length && mine.place === null && view.phase !== "finished" && <p className="fine">{watching ? `${names[me]} holds ${mine.hand} ${mine.hand === 1 ? "card" : "cards"}.` : "Your hand is empty."}</p>}
        </div>
      </section>

      <div className="bubble-layer" aria-live="polite">
        {[...bubbles.entries()].map(([s, m]) => (
          <Bubble key={`${s}-${m.at}`} message={m} seat={s} />
        ))}
      </div>

      {fx}
      {view.phase === "finished" && view.finished[0] === me && <Confetti />}
      {view.phase === "finished" && (
        <div className="sheet won-sheet">
          <h2>{view.finished[0] === me ? "You won! 👑" : view.loser === me ? "Left holding the cards 😅" : `${names[view.finished[0]!]} won 👑`}</h2>
          <ol className="placings">
            {order.map((s, i) => (
              <li key={s} className={s === me ? "mine" : ""}>
                {i === 0 ? "🥇" : i === order.length - 1 ? "🃏" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {names[s]}
              </li>
            ))}
          </ol>
          <button type="button" className="primary" onClick={onLeave}>
            Play again
          </button>
        </div>
      )}
    </main>
  );
}
