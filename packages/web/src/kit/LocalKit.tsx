// A kit game in this browser: you in seat 0 and computer players from the roster, who play in
// their own styles, at the table's speed, and chat a little.
//
// With `others`, more people sit at the same device (see sameDevice.ts): they take the seats after
// yours, computer players fill whatever is left, and the screen shows the table of whoever's move
// it is. Nothing here needs the server, so all of it works with no connection.
//
// With `guests`, this is also a table on the wifi (wifi/WifiHost.tsx): each guest has the seat after
// the people here, played from their own device over a channel. This page is their server: it is
// sent their moves and sends each of them their own seat's view, so a hand stays hidden from the
// other guests exactly as it does at a family table.
import { PassCurtain } from "./PassCurtain";
import { addGame, harder, RecordShown, type GameRecord } from "../record";
import { GameError, isBoardGame, kitGame, kitGreet, reactToKit, type KitGameId, type KitRemark } from "@journey-to-code/games";
import { palaceReplyTo } from "@journey-to-code/palace";
import type { ChatMessage } from "@journey-to-code/rooms/client";
import { mulberry32, paceDelay, personaFor, pickPersonas, styleFor } from "@journey-to-code/rules";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadTableSettings, saveTableSettings } from "../storage";
import { TableTime } from "../board/SeatClock";
import { TurnClock } from "../TurnClock";
import { GameTable } from "./GameTable";
import { botMove, type BotJob } from "./botMove";
import { THINK_BUDGET, thinkElsewhere, warmThinker } from "./botThinker";
import { passesDevice, personName, seatAtScreen } from "./sameDevice";
import type { PeerLink } from "../wifi/link";

/** On a board the screen stays with the person who moved for a moment, so they see the piece land before the board turns to the next person. */
const HANDOVER_MS = 900;

export function LocalKit({ game: id, name, others, guests, rules, seats, seed, onLeave, onAgain }: { game: KitGameId; /** Start the same game again with a new deal (not offered to a wifi table, whose guests would have to join again). */ onAgain?: () => void; name: string; /** The other people at this device, in seat order after you. */ others?: string[]; /** People on their own devices on this wifi, in seat order after the people here. */ guests?: { name: string; link: PeerLink }[]; rules: unknown; seats: number; seed: number; onLeave: () => void }) {
  const game = kitGame(id)!;
  /** Seats 0 to people - 1 are people at this device; the rest are computer players. */
  const people = Math.min(seats, 1 + (others?.length ?? 0));
  /** Seats `people` to `humans - 1` are guests on the wifi; computer players start at `humans`. */
  const away = useMemo(() => (guests ?? []).slice(0, seats - people), [guests, seats, people]);
  const humans = people + away.length;
  const bots = useMemo(() => pickPersonas(seats - humans, mulberry32(seed)).map((p) => p.name), [seats, humans, seed]);
  const names = useMemo(
    () => [people > 1 || away.length ? personName(name === "You" ? "" : name, 0) : name, ...(others ?? []).slice(0, people - 1).map((n, i) => personName(n, i + 1)), ...away.map((g, i) => personName(g.name, people + i)), ...bots],
    [name, others, people, away, bots],
  );
  const cast = useMemo(() => ({ bots: bots.map((n, i) => ({ seat: i + humans, name: n })) }), [bots, humans]);
  const [state, setState] = useState(() => game.newGame(game.normalize(rules), seats, seed));
  const [settings, setSettings] = useState(loadTableSettings);
  // Your record: only a game you played alone (against computer players, or a solitaire) counts.
  const counted = people === 1 && !(guests?.length);
  const [record, setRecord] = useState<GameRecord | null>(null);
  const recorded = useRef(false);
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    if (!counted || recorded.current || !game.summary(state).over) return;
    recorded.current = true;
    const over = (game.view(state, 0) as { over?: { winners?: number[] } | null }).over;
    const won = over?.winners ? over.winners.includes(0) : game.summary(state).order?.[0] === 0;
    setRecord(addGame(id, won, settings.skill));
  }, [state]);

  // When the table last changed, so your own moves can say how long they took: a game's clock keeps
  // running while an offer is made and answered (offers.ts), and that is how the game knows.
  // A game that keeps time in its state (a chess clock) is told the same of every move, a computer
  // player's too, and its clocks are drawn counting from this moment.
  const since = useMemo(() => Date.now(), [state]);
  const changed = useRef(since);
  changed.current = since;
  const time = useMemo(() => ({ since, now: Date.now }), [since]);
  /** A move by any seat, timed. Resolves to an error message when the game refuses it. */
  const moveAs = useCallback(async (seat: number, move: Record<string, unknown>) => {
    try {
      const next = game.apply(latest.current, seat, move, { elapsed: Math.max(0, Date.now() - changed.current) });
      latest.current = next;
      setState(next);
      return null;
    } catch (e) {
      if (e instanceof GameError) return e.message;
      throw e;
    }
  }, []);
  // Whose table the screen shows: yours, or with several people here, whoever's move it is.
  const [here, setHere] = useState(0);
  const hereNow = useRef(here);
  hereNow.current = here;
  const next = useMemo(() => seatAtScreen(game, state, people, here), [state, here]);
  // A game with hands to hide is passed round: between people the screen is covered until the next
  // one taps, so nobody sees a hand that isn't theirs.
  const passing = people > 1 && passesDevice(id);
  const [curtain, setCurtain] = useState<number | null>(null);
  useEffect(() => {
    if (next === here) return;
    if (passing) {
      setCurtain(next);
      setHere(next);
      return;
    }
    const timer = setTimeout(() => setHere(next), isBoardGame(id) ? HANDOVER_MS : 0);
    return () => clearTimeout(timer);
  }, [next, here]);
  const act = useCallback(async (move: Record<string, unknown>) => {
    const seat = hereNow.current;
    const before = game.view(latest.current, seat) as { result: unknown; over: unknown };
    const refused = await moveAs(seat, move);
    // After a hole, a frame or a game of a match, one press moves everyone here on: the others
    // have seen the same scores on the same screen.
    if (!refused && people > 1 && before.result && !before.over) {
      for (let other = 0; other < people; other++) {
        if (other === seat) continue;
        try {
          const moved = game.apply(latest.current, other, move, { elapsed: 0 });
          latest.current = moved;
          setState(moved);
        } catch (e) {
          if (!(e instanceof GameError)) throw e;
        }
      }
    }
    return refused;
  }, []);

  // A clock of the game's own (Drop Four's shot clock in drinking mode) runs here as it does at a
  // family table: on your seat only, from the moment the state changed, with the game's timeout move
  // when it runs out. There's no turn timer in practice (nobody is waiting on you), but a game that
  // is played against a clock isn't the same game without it. Computer players aren't held to it,
  // and move well inside it, unless the clock is `strict` (a chess clock): then it runs on their
  // seats too, and they can lose on time like anyone.
  const own = useMemo(() => game.deadline?.(state) ?? null, [state]);
  const insideTheClock = (seat: number, delay: number) => (own && own.seat === seat ? Math.min(delay, Math.round(own.after * 0.6)) : delay);
  const [deadline, setDeadline] = useState<{ at: number; seat: number } | null>(null);
  useEffect(() => {
    if (!own || (own.seat >= humans && !own.strict)) return setDeadline(null);
    setDeadline({ at: since + own.after, seat: own.seat });
    const timer = setTimeout(() => {
      // Only if nothing has happened since: a move made as the clock ran out is the one that counts.
      if (latest.current === state) void moveAs(own.seat, own.move);
    }, Math.max(0, since + own.after - Date.now()));
    return () => clearTimeout(timer);
  }, [own]);

  // A computer player moves after a humanlike pause: the first one with something to do. A pause
  // already running isn't restarted when someone else moves (in Speed, a quick person mustn't keep
  // resetting the computer's clock); when it ends, the move is worked out from the table as it is then.
  //
  // A heavy think (a search, a simulation: see `TableGame.heavy`) is done in a Web Worker, so the
  // page doesn't freeze while a computer player makes up its mind. It starts when the pause does and
  // is played when both are done, on the state it was worked out for and no other: if the table has
  // changed by then, the answer is dropped and asked for again. With no worker to ask (see
  // botThinker.ts), and for every quick think, the move is worked out right here, as it always was.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The move in the making; cleared when the table is left, so an answer that comes late goes nowhere. */
  const turn = useRef<object | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // The worker, and the engine in it, are ready before the first think is wanted.
    if (game.heavy) warmThinker(id);
  }, []);
  useEffect(() => {
    if (game.summary(state).over || pending.current) return;
    const style = (s: number) => styleFor(personaFor(bots[s - humans]!).style, settings.skill);
    // A heavy think isn't done here just to find out whether there is one: the game says so itself.
    const seat = bots.map((_, i) => i + humans).find((s) => game.heavy?.(state, s) || game.bot(state, s, style(s)) !== null);
    if (seat === undefined) return;
    const job = (of: unknown): BotJob => ({ game: id, state: of, seat, name: bots[seat - humans]!, skill: settings.skill, budget: THINK_BUDGET });
    const ask = (of: unknown) => (game.heavy?.(of, seat) ? thinkElsewhere(job(of)) : null);
    const mine = {};
    turn.current = mine;
    let thought = { state: state as unknown, answer: ask(state) };
    thought.answer?.catch(() => {}); // reported when the pause ends
    const play = async () => {
      for (;;) {
        if (turn.current !== mine) return;
        const now = latest.current as unknown;
        if (thought.state !== now) thought = { state: now, answer: ask(now) };
        if (!thought.answer) break; // a quick think, or no worker: on the page, below
        const answered = thought;
        let move: Record<string, unknown> | null;
        try {
          move = await answered.answer;
        } catch (e) {
          console.error(e);
          if (turn.current === mine) pending.current = null;
          return;
        }
        if (turn.current !== mine) return; // the table was left meanwhile
        if (latest.current !== answered.state) continue; // the table changed while it thought: ask again
        pending.current = null;
        if (move) {
          try {
            const next = game.apply(answered.state, seat, move, { elapsed: Math.max(0, Date.now() - changed.current) });
            latest.current = next;
            setState(next);
          } catch {}
        }
        return setTick((t) => t + 1);
      }
      pending.current = null;
      setState((prev: unknown) => {
        const move = botMove(job(prev));
        if (!move) return prev;
        try {
          const next = game.apply(prev, seat, move, { elapsed: Math.max(0, Date.now() - changed.current) });
          latest.current = next;
          return next;
        } catch {
          return prev;
        }
      });
      setTick((t) => t + 1);
    };
    pending.current = setTimeout(() => void play(), game.reactionTime?.(state, seat, style(seat)) ?? insideTheClock(seat, paceDelay(settings.pace, () => Math.round(game.thinkingTime(state, seat) * personaFor(bots[seat - humans]!).pace * (0.8 + Math.random() * 0.5)))));
  }, [state, bots, settings, tick]);
  useEffect(
    () => () => {
      // Forget the pause as well as stopping it: left set, it would look like one still running, and
      // no computer player would move again (React's StrictMode remounts every table once in dev).
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
      turn.current = null;
    },
    [],
  );

  // Table talk.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const lastWord = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const speak = useCallback(
    (remarks: KitRemark[], always = false) => {
      for (const r of remarks) {
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          if (!always && Date.now() - lastWord.current < 1200) return;
          lastWord.current = Date.now();
          setMessages((m) => [...m, { seat: r.seat, name: names[r.seat]!, text: r.text, at: Date.now(), bot: true }]);
        }, r.delay);
        timers.current.add(timer);
      }
    },
    [names],
  );
  const before = useRef<unknown>(null);
  useEffect(() => {
    if (!before.current) speak(kitGreet(cast, undefined, id));
    else if (before.current !== state) speak(reactToKit(game.summary(before.current), game.summary(state), cast), true);
    before.current = state;
  }, [state, cast, speak]);

  const send = async (text: string) => {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 280);
    if (!clean) return "Say something first.";
    setMessages((m) => [...m, { seat: hereNow.current, name: names[hereNow.current]!, text: clean, at: Date.now(), bot: false }]);
    speak(palaceReplyTo(clean, cast), true);
    return null;
  };

  // The guests on the wifi: each is sent their seat's view whenever the table changes, and their
  // moves are made here, with the game's answer (a refusal, in words, or nothing) sent back.
  const [gone, setGone] = useState<number[]>([]);
  useEffect(() => {
    away.forEach((guest, i) => guest.link.send({ t: "view", seat: people + i, names, view: game.view(state, people + i) }));
  }, [state, names, away]);
  useEffect(() => {
    const stops = away.flatMap((guest, i) => [
      guest.link.listen((message) => {
        if (message.t !== "move" || !message.move || typeof message.move !== "object") return;
        void moveAs(people + i, message.move).then((error) => guest.link.send({ t: "ack", id: message.id, error }));
      }),
      guest.link.closed(() => setGone((seats) => [...seats, people + i])),
    ]);
    return () => stops.forEach((stop) => stop());
  }, [away]);

  const view = useMemo(() => game.view(state, here), [state, here]);
  return (
    <RecordShown.Provider
      value={
        record && {
          record,
          harder: harder(record),
          raise: () => {
            const up = harder(record);
            if (!up) return;
            const next = { ...settings, skill: up };
            saveTableSettings(next);
            setSettings(next);
            setRecord({ ...record, streakSkill: undefined });
          },
        }
      }
    >
    <TableTime.Provider value={time}>
      <GameTable
        view={view}
        rules={rules}
        onAgain={guests?.length ? undefined : onAgain}
        names={names}
        act={act}
        onLeave={onLeave}
        banner={gone.length > 0 ? <p className="wifi-gone" role="status">{gone.map((seat) => names[seat]).join(" and ")} dropped off the wifi. The table is as they left it.</p> : undefined}
        // People round one screen talk across it; the chat is for the computer players' table talk.
        chat={bots.length > 0 ? { messages, mySeat: here, send } : undefined}
        together={people > 1}
        settings={{
          value: settings,
          change: (next) => {
            saveTableSettings(next);
            setSettings(next);
          },
        }}
      />
      <TurnClock deadline={deadline} mySeat={here} now={Date.now} />
      {curtain !== null && <PassCurtain name={names[curtain] ?? "the next player"} onReady={() => setCurtain(null)} />}
    </TableTime.Provider>
    </RecordShown.Provider>
  );
}
