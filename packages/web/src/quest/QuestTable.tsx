// Zubra Quest, played in this browser: a sixteen-bit adventure on a screen of 256 by 224 pixels,
// made as big as the window allows in whole pixels, so every one of them stays square. The engine
// is open.games' `zubraQuest`; the pictures are in `art.ts` and the screen in `render.ts`.
//
// It has a screen of its own, apart from the arcade table, because of what is different about it:
// it is a long game, so it is kept in this browser as it goes and can be picked up again; it has a
// title screen; and under a finger it wants a pad and two buttons, not a drag.
//
// A game on the kit has to end, so a hero left alone for five minutes goes to sleep. That is for
// logs and tests. Here the game simply stops when nobody has touched it for a while, or the page
// is hidden, and waits.
import { QUEST_TOOLS, zubraQuest, type ArcadeView, type QuestInput, type QuestState } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";
import { setArcadeSound, wakeArcadeSound } from "../arcade/sounds";
import { loadFeedbackSettings, saveFeedbackSettings } from "../feedback/sounds";
import { RETRO_H, RETRO_W } from "../retro/pixels";
import { loadArcadeBest, loadQuest, saveArcadeBest, saveQuest, type ArcadeRules } from "../storage";
import { questScreen } from "./render";
import { questMusic, questSounds } from "./sound";

interface Props {
  rules: ArcadeRules;
  seed: number;
  /** Back to the game's setup screen. */
  onLeave: () => void;
}

/** Ticks with nothing touched before the game stops and waits. */
const REST_AFTER = 60 * 25;
/** Where the lines of the title screen are, for a finger: the first line's top, and how far apart they are. */
const MENU = { top: 88, step: 14 };

/** The tool after this one, among those the hero has. */
export function nextTool(now: number, items: readonly string[]): number {
  for (let n = 1; n <= QUEST_TOOLS.length; n++) {
    const tool = (now + n) % QUEST_TOOLS.length;
    if (items.includes(QUEST_TOOLS[tool]!)) return tool;
  }
  return now;
}

/** Which way a pad is pushed, from where the finger is on it: eight ways, and nothing in the middle. */
export function padWay(dx: number, dy: number, dead: number): [number, number] {
  if (dx * dx + dy * dy < dead * dead) return [0, 0];
  const turn = Math.atan2(dy, dx);
  const eighth = Math.round(turn / (Math.PI / 4));
  // Adding 0 turns a rounded "minus nothing" into plain 0.
  return [Math.round(Math.cos((eighth * Math.PI) / 4)) + 0, Math.round(Math.sin((eighth * Math.PI) / 4)) + 0];
}

/** The tune for where the hero is. */
const tuneFor = (view: ArcadeView) => (view.over ? null : view.boss ? "boss" : view.realm?.area === "den" ? "den" : view.realm?.area === "cave" ? "cave" : "over");

export function QuestTable({ rules, seed, onLeave }: Props) {
  const game = zubraQuest;
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"title" | "play">("title");
  const [paused, setPaused] = useState(false);
  const [how, setHow] = useState(false);
  const [ending, setEnding] = useState<{ outcome: string; score: number; best: boolean; line: string } | null>(null);
  const [sound, setSound] = useState(() => loadFeedbackSettings().sound);
  const [run, setRun] = useState(0);
  // What the loop reads, kept where a render does not reset it.
  const live = useRef({ mode, paused, how, choice: 0, keys: new Set<string>(), stick: [0, 0] as [number, number], a: false, b: false, tool: 0, swap: false, state: null as QuestState | null, fresh: false });
  live.current.mode = mode;
  live.current.paused = paused;
  live.current.how = how;
  const kept = useRef(loadQuest());
  const lines = kept.current ? ["CONTINUE", "NEW QUEST", "HOW TO PLAY"] : ["NEW QUEST", "HOW TO PLAY"];
  const linesRef = useRef(lines);
  linesRef.current = lines;

  function begin(line: string) {
    const l = live.current;
    wakeArcadeSound();
    if (line === "HOW TO PLAY") return setHow(true);
    const saved = line === "CONTINUE" ? (kept.current as QuestState | null) : null;
    l.state = saved ?? game.newGame(game.normalize(rules), 1, seed + run);
    l.tool = l.state.hero.tool;
    l.fresh = true;
    setEnding(null);
    setPaused(false);
    setMode("play");
  }
  const beginRef = useRef(begin);
  beginRef.current = begin;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const l = live.current;
    const screen = questScreen();
    const music = questMusic();
    const picture = ctx.createImageData(RETRO_W, RETRO_H);
    let raf = 0;
    let last = performance.now();
    let owed = 0;
    let frame = 0;
    let rest = 0;
    let saveIn = 0;
    let room = -1;
    let done = false;

    /** As big as fits in whole screen pixels, so no pixel of the game is wider than another. */
    const resize = () => {
      const box = el.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const by = Math.max(1, Math.floor(Math.min((box.width * dpr) / RETRO_W, (box.height * dpr) / RETRO_H)));
      el.style.width = `${(RETRO_W * by) / dpr}px`;
      el.style.height = `${(RETRO_H * by) / dpr}px`;
    };
    const keep = () => { if (l.state && l.state.phase === "play") saveQuest(l.state); };
    const pause = () => { if (l.mode === "play" && !done) { keep(); setPaused(true); } };

    const read = (): QuestInput => {
      const k = l.keys;
      let dx = (k.has("arrowright") || k.has("d") ? 1 : 0) - (k.has("arrowleft") || k.has("a") ? 1 : 0);
      let dy = (k.has("arrowdown") || k.has("s") ? 1 : 0) - (k.has("arrowup") || k.has("w") ? 1 : 0);
      if (!dx && !dy) [dx, dy] = l.stick;
      return { dx, dy, a: l.a || k.has("z") || k.has("j") || k.has(" "), b: l.b || k.has("x") || k.has("k"), tool: l.tool };
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      frame++;
      if (l.mode === "title" || !l.state) {
        music.play(null);
        ctx.putImageData((picture.data.set(screen.title(frame, linesRef.current, l.choice)), picture), 0, 0);
        return;
      }
      const s = l.state;
      if (l.fresh) { l.fresh = false; done = false; rest = 0; room = -1; owed = 0; }
      if (!l.paused && !l.how && !done) {
        owed += dt;
        const tick = 1000 / game.rate;
        for (let n = 0; owed >= tick && n < 6; n++) {
          owed -= tick;
          const input = read();
          const touched = input.dx !== 0 || input.dy !== 0 || input.a || input.b || l.swap;
          if (l.swap) {
            l.swap = false;
            l.tool = nextTool(l.tool, game.view(s).realm!.hero.items);
          }
          rest = touched ? 0 : rest + 1;
          if (rest >= REST_AFTER) { pause(); break; }
          game.step(s, [{ ...input, tool: l.tool }]);
          screen.hear(s.events);
          questSounds(s.events);
          screen.settle();
          if (s.room !== room || --saveIn <= 0) { room = s.room; saveIn = 60 * 5; keep(); }
        }
        if (owed > 200) owed = 0;
      }
      const view = game.view(s);
      music.play(l.paused || l.how ? null : tuneFor(view));
      picture.data.set(screen.draw(view, frame));
      ctx.putImageData(picture, 0, 0);
      if (view.over && !done) {
        done = true;
        saveQuest(null);
        kept.current = null;
        const best = saveArcadeBest("zubraquest", rules, 1, view.score);
        setEnding({ outcome: view.realm?.outcome ?? "lost", score: view.score, best, line: game.summary(s).scoreLine });
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isDown = e.type === "keydown";
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "tab"].includes(key)) e.preventDefault();
      if (isDown) wakeArcadeSound();
      if (isDown && !e.repeat) {
        if (l.mode === "title" && !l.how) {
          const menu = linesRef.current;
          if (key === "arrowup" || key === "w") l.choice = (l.choice + menu.length - 1) % menu.length;
          else if (key === "arrowdown" || key === "s") l.choice = (l.choice + 1) % menu.length;
          else if (key === "enter" || key === " " || key === "z") beginRef.current(menu[l.choice % menu.length]!);
          return;
        }
        if (key === "escape" || key === "p" || key === "enter") { if (l.how) setHow(false); else if (l.paused) setPaused(false); else pause(); return; }
        if (key === "c" || key === "l" || key === "tab") l.swap = true;
      }
      if (isDown) l.keys.add(key);
      else l.keys.delete(key);
    };
    const onBlur = () => { l.keys.clear(); l.stick = [0, 0]; l.a = false; l.b = false; };
    const onHide = () => document.hidden && pause();
    /** A finger on the title screen picks the line it is on. */
    const tap = (e: PointerEvent) => {
      wakeArcadeSound();
      if (l.mode !== "title" || l.how) return;
      const box = el.getBoundingClientRect();
      const n = Math.floor((((e.clientY - box.top) / box.height) * RETRO_H - MENU.top) / MENU.step);
      if (n >= 0 && n < linesRef.current.length) { l.choice = n; beginRef.current(linesRef.current[n]!); }
    };

    resize();
    raf = requestAnimationFrame(loop);
    addEventListener("keydown", onKey);
    addEventListener("keyup", onKey);
    addEventListener("blur", onBlur);
    addEventListener("resize", resize);
    addEventListener("pagehide", keep);
    document.addEventListener("visibilitychange", onHide);
    el.addEventListener("pointerdown", tap);
    const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    if (el.parentElement) watcher?.observe(el.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      music.stop();
      keep();
      removeEventListener("keydown", onKey);
      removeEventListener("keyup", onKey);
      removeEventListener("blur", onBlur);
      removeEventListener("resize", resize);
      removeEventListener("pagehide", keep);
      document.removeEventListener("visibilitychange", onHide);
      el.removeEventListener("pointerdown", tap);
      watcher?.disconnect();
    };
    // The loop reads what changes through `live`; it is made once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    saveFeedbackSettings({ ...loadFeedbackSettings(), sound: next });
    setArcadeSound(next);
    if (next) wakeArcadeSound();
  }

  /** The pad: wherever the finger is on it is the way pushed. */
  const push = (e: React.PointerEvent) => {
    const box = pad.current!.getBoundingClientRect();
    live.current.stick = padWay(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2), box.width * 0.14);
  };
  const button = (which: "a" | "b") => ({
    onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); wakeArcadeSound(); live.current[which] = true; },
    onPointerUp: () => { live.current[which] = false; },
    onPointerCancel: () => { live.current[which] = false; },
  });
  const toTitle = () => {
    kept.current = loadQuest();
    live.current.choice = 0;
    setEnding(null);
    setPaused(false);
    setRun((n) => n + 1);
    setMode("title");
  };

  return (
    <main className="arcade quest">
      <div className="arcade-cabinet">
        <div className="arcade-stage quest-stage">
          <canvas ref={canvas} width={RETRO_W} height={RETRO_H} className="quest-screen" aria-label="Zubra Quest" />
          {how && (
            <section className="arcade-sheet" aria-label="How to play">
              <div className="arcade-card">
                <h2>How to play</h2>
                <ul className="arcade-controls">
                  {game.describe(game.normalize(rules)).map((line) => <li key={line}>{line}</li>)}
                  {game.controls.map((line) => <li key={line}>{line}</li>)}
                </ul>
                <div className="arcade-row">
                  <button type="button" className="primary" autoFocus onClick={() => setHow(false)}>Back</button>
                </div>
              </div>
            </section>
          )}
          {paused && !how && !ending && (
            <section className="arcade-sheet" aria-label="Paused">
              <div className="arcade-card">
                <h2>Paused</h2>
                <p>Your quest is kept on this device. Come back to it whenever you like.</p>
                <div className="arcade-row">
                  <button type="button" className="primary" autoFocus onClick={() => setPaused(false)}>Carry on</button>
                  <button type="button" className="secondary" onClick={() => setHow(true)}>How to play</button>
                  <button type="button" className="secondary" onClick={toTitle}>Title screen</button>
                </div>
              </div>
            </section>
          )}
          {ending && (
            <section className="arcade-sheet quest-end" aria-label="The end">
              <div className="arcade-card">
                <h2>{ending.outcome === "won" ? "The Stripes are home" : ending.outcome === "asleep" ? "Zub fell asleep" : "The quest is over"}</h2>
                <div className="arcade-final">{ending.score.toLocaleString("en-US")}</div>
                <p>{ending.line}{ending.best ? " · your best yet" : ` · best ${loadArcadeBest("zubraquest", rules, 1).toLocaleString("en-US")}`}</p>
                <div className="arcade-row">
                  <button type="button" className="primary" autoFocus onClick={toTitle}>A new land</button>
                  <button type="button" className="secondary" onClick={onLeave}>Leave</button>
                </div>
              </div>
            </section>
          )}
        </div>
        {mode === "play" && (
          <div className="quest-pad" aria-hidden="true">
            <div ref={pad} className="quest-stick" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); wakeArcadeSound(); push(e); }} onPointerMove={(e) => e.buttons && push(e)} onPointerUp={() => { live.current.stick = [0, 0]; }} onPointerCancel={() => { live.current.stick = [0, 0]; }}>
              <i /><i /><i /><i />
            </div>
            <button type="button" className="quest-tool" onPointerDown={() => { live.current.swap = true; }}>Tool</button>
            <div className="quest-buttons">
              <button type="button" className="quest-b" {...button("b")}>B</button>
              <button type="button" className="quest-a" {...button("a")}>A</button>
            </div>
          </div>
        )}
        <div className="arcade-rail low">
          <button type="button" className="arcade-btn" onClick={onLeave}>‹ Back</button>
          <span className="arcade-grow" />
          {mode === "play" && !ending && <button type="button" className="arcade-btn" onClick={() => setPaused((p) => !p)}>{paused ? "Carry on" : "Pause"}</button>}
          <button type="button" className="arcade-btn" aria-pressed={sound} aria-label={sound ? "Turn sounds off" : "Turn sounds on"} onClick={toggleSound}>{sound ? "🔊" : "🔇"}</button>
        </div>
      </div>
    </main>
  );
}
