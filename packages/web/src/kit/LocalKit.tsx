// A kit game in this browser: you in seat 0 and computer players from the roster, who play in
// their own styles, at the table's speed, and chat a little.
import { GameError, kitGame, kitGreet, reactToKit, type KitGameId, type KitRemark } from "@cardroom/games";
import { palaceReplyTo } from "@cardroom/palace";
import type { ChatMessage } from "@spades/rooms/client";
import { mulberry32, paceDelay, personaFor, pickPersonas, styleFor } from "@spades/rules";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadTableSettings, saveTableSettings } from "../storage";
import { TableTime } from "../board/SeatClock";
import { TurnClock } from "../TurnClock";
import { GameTable } from "./GameTable";
import { botMove, type BotJob } from "./botMove";
import { THINK_BUDGET, thinkElsewhere, warmThinker } from "./botThinker";

export function LocalKit({ game: id, name, rules, seats, seed, onLeave }: { game: KitGameId; name: string; rules: unknown; seats: number; seed: number; onLeave: () => void }) {
  const game = kitGame(id)!;
  const bots = useMemo(() => pickPersonas(seats - 1, mulberry32(seed)).map((p) => p.name), [seats, seed]);
  const names = useMemo(() => [name, ...bots], [name, bots]);
  const cast = useMemo(() => ({ bots: bots.map((n, i) => ({ seat: i + 1, name: n })) }), [bots]);
  const [state, setState] = useState(() => game.newGame(game.normalize(rules), seats, seed));
  const [settings, setSettings] = useState(loadTableSettings);
  const latest = useRef(state);
  latest.current = state;

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
  const act = useCallback((move: Record<string, unknown>) => moveAs(0, move), []);

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
    if (!own || (own.seat !== 0 && !own.strict)) return setDeadline(null);
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
    const style = (s: number) => styleFor(personaFor(bots[s - 1]!).style, settings.skill);
    // A heavy think isn't done here just to find out whether there is one: the game says so itself.
    const seat = bots.map((_, i) => i + 1).find((s) => game.heavy?.(state, s) || game.bot(state, s, style(s)) !== null);
    if (seat === undefined) return;
    const job = (of: unknown): BotJob => ({ game: id, state: of, seat, name: bots[seat - 1]!, skill: settings.skill, budget: THINK_BUDGET });
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
    pending.current = setTimeout(() => void play(), game.reactionTime?.(state, seat, style(seat)) ?? insideTheClock(seat, paceDelay(settings.pace, () => Math.round(game.thinkingTime(state, seat) * personaFor(bots[seat - 1]!).pace * (0.8 + Math.random() * 0.5)))));
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
    setMessages((m) => [...m, { seat: 0, name, text: clean, at: Date.now(), bot: false }]);
    speak(palaceReplyTo(clean, cast), true);
    return null;
  };

  const view = useMemo(() => game.view(state, 0), [state]);
  return (
    <TableTime.Provider value={time}>
      <GameTable
        view={view}
        names={names}
        act={act}
        onLeave={onLeave}
        chat={{ messages, mySeat: 0, send }}
        settings={{
          value: settings,
          change: (next) => {
            saveTableSettings(next);
            setSettings(next);
          },
        }}
      />
      <TurnClock deadline={deadline} mySeat={0} now={Date.now} />
    </TableTime.Provider>
  );
}
