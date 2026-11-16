// The arcade table: any arcade game, played in this browser. You have seat 0 and computer players
// the rest. The game runs at its own rate whatever the screen's (a fixed step, caught up a few ticks
// at a time), is drawn from its view on a canvas, and stops while the page is hidden or paused.
//
// A game that is steered (Shitstorm) is played with the keys and a finger on the field. A game that
// builds on a grid (Tower of Ryan) says so in its view (`build`), and gets a shop under the field: pick
// something and tap a square to build it, or tap what stands there to upgrade or sell it. A game
// with things to buy that are built nowhere (Chip Stack) says so too (`market`): its field is
// shorter, a tap on it is a tap, and everything on offer is listed underneath.
import { arcadeGame, points, shortly, type ArcadeBuild, type ArcadeGameId, type ArcadeMarket, type ArcadeView } from "@journey-to-code/games";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadFeedbackSettings, saveFeedbackSettings } from "../feedback/sounds";
import { loadArcadeBest, saveArcadeBest, type ArcadeRules } from "../storage";
import { controlsFor } from "./controls";
import { createArcadeScreen, type ArcadePointer } from "./screen";
import { notes, setArcadeSound, wakeArcadeSound } from "./sounds";

interface Props {
  game: ArcadeGameId;
  rules: ArcadeRules;
  seats: number;
  seed: number;
  autofire: boolean;
  /** Back to the game's setup screen. */
  onLeave: () => void;
}

/** What the corners show. The score is written straight to the page, as it changes most ticks. */
interface Hud {
  stage: string;
  lives: number;
  stats: ArcadeView["pilots"][number]["stats"];
  build: ArcadeBuild | null;
  market: ArcadeMarket | null;
}
interface Ending {
  score: number;
  best: number;
  isBest: boolean;
  stage: string;
  time: string;
  scores: number[];
}

/** The computer players: steady, and not quite perfect. */
const WINGMAN = { skill: 0.75, sloppy: 0.04 };
const clock = (ticks: number, rate: number) => `${Math.floor(ticks / rate / 60)}:${String(Math.floor(ticks / rate) % 60).padStart(2, "0")}`;

export function ArcadeTable({ game: id, rules, seats, seed, autofire, onLeave }: Props) {
  const game = arcadeGame(id)!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const scoreEl = useRef<HTMLElement>(null);
  const bankEl = useRef<HTMLElement>(null);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ending, setEnding] = useState<Ending | null>(null);
  const [hud, setHud] = useState<Hud>({ stage: "", lives: 0, stats: [], build: null, market: null });
  // Building: what is picked in the shop, and which square is picked out on the field.
  const [pick, setPick] = useState<string | null>(null);
  const [chosen, setChosen] = useState<[number, number] | null>(null);
  const pointing = useRef<{ pick: string | null; chosen: [number, number] | null; hover: [number, number] | null }>({ pick: null, chosen: null, hover: null });
  pointing.current.pick = pick;
  pointing.current.chosen = chosen;
  const [sound, setSound] = useState(() => loadFeedbackSettings().sound);
  const [best, setBest] = useState(() => loadArcadeBest(id, rules, seats));
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const controls = useMemo(() => controlsFor(id, { autofire: () => autofire }), [id, autofire]);

  useEffect(() => {
    const el = canvas.current!;
    const normal = game.normalize(rules);
    // Play again: a new game from a new seed.
    const state = game.newGame(normal, seats, run === 0 ? seed : Math.floor(Math.random() * 2 ** 31));
    const screen = createArcadeScreen(el, game.view(state).field);
    screen.resize();
    controls.clear();
    setEnding(null);
    setPaused(false);
    setChosen(null);
    pointing.current.hover = null;
    let over = false;
    let frame = 0;
    let last = performance.now();
    let owed = 0;
    let hudKey = "";
    let raf = 0;
    const stepMs = 1000 / game.rate;

    function tick() {
      const inputs: unknown[] = [controls.read()];
      for (let seat = 1; seat < seats; seat++) inputs.push(game.bot(state, seat, WINGMAN));
      game.step(state, inputs);
      const view = game.view(state);
      screen.hear(view.events, false, 0);
      screen.settle();
      if (view.over) {
        over = true;
        const sum = game.summary(state);
        const isBest = saveArcadeBest(id, rules, seats, sum.score);
        const now = loadArcadeBest(id, rules, seats);
        setBest(now);
        setEnding({ score: sum.score, best: now, isBest, stage: view.stage, time: clock(sum.ticks, game.rate), scores: sum.scores });
        if (isBest && sum.score > 0) notes([523, 659, 784, 1046, 1318]);
      }
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      if (!pausedRef.current && !over) {
        owed += dt;
        // Catch up a few ticks at most: after a long stall the game carries on from where it was.
        let steps = 0;
        while (owed >= stepMs && steps++ < 5 && !over) {
          tick();
          owed -= stepMs;
          frame++;
        }
        if (owed > stepMs * 5) owed = 0;
      } else if (over) {
        screen.settle();
        frame++;
      }
      const view = game.view(state);
      const build = view.build;
      let pointer: ArcadePointer | undefined;
      if (build && !over) {
        const { pick: picked, chosen: at, hover } = pointing.current;
        const standing = at && build.built.find((b) => b.col === at[0] && b.row === at[1]);
        const item = picked ? build.shop.find((i) => i.key === picked) : undefined;
        if (standing) pointer = { cell: [standing.col, standing.row], range: standing.range, tone: "white" };
        else if (item && hover) pointer = { cell: hover, range: item.range, tone: item.tone, open: !build.closed.includes(hover[1] * build.cols + hover[0]) && !build.built.some((b) => b.col === hover[0] && b.row === hover[1]) };
      }
      screen.draw(view, frame, pointer);
      const me = view.pilots[0];
      const market = view.market;
      if (scoreEl.current) scoreEl.current.textContent = market ? shortly(view.score) : points(view.score);
      if (bankEl.current && market) bankEl.current.textContent = shortly(market.bank);
      if (me) {
        const building = build ? `|${build.bank}|${build.lives}|${build.next ? `${build.next.wave}:${Math.ceil(build.next.inTicks / game.rate)}:${build.next.bonus}` : ""}|${build.built.map((b) => `${b.id}:${b.level}`).join(",")}` : "";
        // The bank is written straight to the page; the list is drawn again only when what it says changes.
        const selling = market ? `|${market.perSecond}|${market.perTap}|${market.items.map((i) => `${i.key}:${i.cost}:${i.owned ?? ""}:${i.can ? 1 : 0}:${i.label}`).join(",")}|${market.badges.map((b) => b.label).join(",")}` : "";
        const stats = market ? "" : me.stats.map((s) => (s.max && s.max >= 100 ? Math.round((s.value * 20) / s.max) : s.value)).join(",");
        const key = `${view.stage}|${me.lives}|${stats}${building}${selling}`;
        if (key !== hudKey) {
          hudKey = key;
          setHud({ stage: view.stage, lives: me.lives, stats: me.stats, build: build ?? null, market: market ?? null });
        }
      }
    }
    raf = requestAnimationFrame(loop);

    const pause = () => !over && setPaused(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      const down = e.type === "keydown";
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) e.preventDefault();
      if (down) wakeArcadeSound();
      if (down && !e.repeat && over && key === "enter") return setRun((n) => n + 1);
      const build = game.view(state).build;
      if (build && down && !e.repeat && !over) {
        // Building by keyboard: a number picks from the shop, U and S are for the tower picked out, Space sends the wave.
        const { chosen: at, pick: picked } = pointing.current;
        const item = build.shop[Number(key) - 1];
        if (item) {
          setPick(item.key);
          return setChosen(null);
        }
        if (key === "escape" && (at || picked)) {
          setChosen(null);
          return setPick(null);
        }
        if (at && key === "u") return controls.order?.("upgrade", at[0], at[1]);
        if (at && key === "s") {
          controls.order?.("sell", at[0], at[1]);
          return setChosen(null);
        }
        if (key === " ") return controls.order?.("send");
      }
      if (down && !e.repeat && !over && (key === "p" || key === "escape")) return setPaused((p) => !p);
      controls.key(key, down);
    };
    const onBlur = () => {
      controls.clear();
      pause();
    };
    const onHide = () => document.hidden && pause();
    const onResize = () => screen.resize();
    const scale = () => game.view(state).field.width / Math.max(1, el.getBoundingClientRect().width);
    /** The square of the grid under a pointer, if the game has a grid and the pointer is on it. */
    const cellAt = (e: PointerEvent): [number, number] | null => {
      const build = game.view(state).build;
      const box = el.getBoundingClientRect();
      if (!build || !box.width) return null;
      const col = Math.floor((((e.clientX - box.left) / box.width) * build.cols * build.cell) / build.cell);
      const row = Math.floor((((e.clientY - box.top) / box.height) * build.rows * build.cell) / build.cell);
      return col >= 0 && col < build.cols && row >= 0 && row < build.rows ? [col, row] : null;
    };
    const down = (e: PointerEvent) => {
      wakeArcadeSound();
      const seen = game.view(state);
      if (seen.market && !over && !pausedRef.current) {
        // A tap on the field is a tap on the chip, unless it lands on something to catch.
        const box = el.getBoundingClientRect();
        const x = ((e.clientX - box.left) / Math.max(1, box.width)) * seen.field.width;
        const y = ((e.clientY - box.top) / Math.max(1, box.height)) * seen.field.height;
        const gold = seen.things.find((t) => t.kind === "golden" && Math.hypot(t.x - x, t.y - y) <= t.r * 1.5);
        return controls.order?.(gold ? "catch" : "tap");
      }
      const build = seen.build;
      const cell = cellAt(e);
      if (build && cell && !over && !pausedRef.current) {
        const { pick: picked } = pointing.current;
        pointing.current.hover = cell;
        if (build.built.some((b) => b.col === cell[0] && b.row === cell[1])) setChosen(cell);
        else {
          setChosen(null);
          // The game says why not, if not: the road, something there already, not enough gold.
          if (picked) controls.order?.("build", cell[0], cell[1], picked);
        }
        return;
      }
      controls.pointerDown(e.pointerId, e.clientX, e.clientY);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* a pointer that can't be captured still moves the ship while it is over the field */
      }
    };
    const move = (e: PointerEvent) => {
      // A mouse shows where a tower would go before it is built; a finger has no hover.
      if (e.pointerType === "mouse") pointing.current.hover = cellAt(e);
      controls.pointerMove(e.pointerId, e.clientX, e.clientY, scale());
    };
    const up = (e: PointerEvent) => controls.pointerUp(e.pointerId);
    addEventListener("keydown", onKey);
    addEventListener("keyup", onKey);
    addEventListener("blur", onBlur);
    addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onHide);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
    if (el.parentElement) watcher?.observe(el.parentElement);
    wakeArcadeSound();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("keydown", onKey);
      removeEventListener("keyup", onKey);
      removeEventListener("blur", onBlur);
      removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onHide);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      watcher?.disconnect();
    };
  }, [run]);

  // A stat that is a meter (a timer running down) is drawn as a bar under the number before it,
  // which is what it belongs to: the chain's timer under the multiplier.
  const cells: { stat: Hud["stats"][number]; meter?: Hud["stats"][number] }[] = [];
  for (const stat of hud.stats) {
    const before = cells[cells.length - 1];
    const isMeter = (stat.max ?? 0) >= 100;
    if (isMeter && before && !before.meter) before.meter = stat;
    else if (!isMeter) cells.push({ stat });
  }

  const market = hud.market;
  const groups = market ? [...new Set(market.items.map((i) => i.group))] : [];
  const build = hud.build;
  const standing = build && chosen ? build.built.find((b) => b.col === chosen[0] && b.row === chosen[1]) : undefined;
  // The first thing in the shop is picked to begin with, so the first tap on the field builds.
  useEffect(() => {
    if (build && pick === null && !chosen) setPick(build.shop[0]?.key ?? null);
  }, [build === null]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    saveFeedbackSettings({ ...loadFeedbackSettings(), sound: next });
    setArcadeSound(next);
    if (next) wakeArcadeSound();
  }

  return (
    <main className="arcade">
      <div className="arcade-cabinet">
        <div className="arcade-rail">
          <div className="arcade-cell">
            <small>Score</small>
            <b className="arcade-score" ref={scoreEl}>0</b>
          </div>
          <div className="arcade-cell">
            <small>Best</small>
            <b className="arcade-best">{market ? shortly(best) : points(best)}</b>
          </div>
          <span className="arcade-grow" />
          <div className="arcade-cell right">
            <small>{game.name}</small>
            <b>{hud.stage}</b>
          </div>
        </div>
        <div className={`arcade-stage ${market ? "short" : ""}`}>
          <canvas ref={canvas} tabIndex={0} aria-label={`${game.name}: the field`} />
          {paused && !ending && (
            <section className="arcade-sheet" aria-label="Paused">
              <div className="arcade-card">
                <h2>Paused</h2>
                <ul className="arcade-controls">
                  {game.controls.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="arcade-row">
                  <button type="button" className="primary" autoFocus onClick={() => setPaused(false)}>
                    Carry on
                  </button>
                  <button type="button" className="secondary" onClick={onLeave}>
                    Leave the game
                  </button>
                </div>
              </div>
            </section>
          )}
          {ending && (
            <section className="arcade-sheet" aria-label="Game over">
              <div className="arcade-card">
                <h2>Game over</h2>
                <div className="arcade-final">{points(ending.score)}</div>
                <p>{ending.isBest ? "A new best on this device." : `Your best: ${points(ending.best)}`}</p>
                {market && <p>Every chip earned in the run.</p>}
                <dl className="arcade-stats">
                  {!market && (
                    <>
                      <dt>Reached</dt>
                      <dd>{ending.stage}</dd>
                    </>
                  )}
                  <dt>Time</dt>
                  <dd>{ending.time}</dd>
                  {ending.scores.length > 1 &&
                    ending.scores.map((n, seat) => (
                      <div key={seat} className="arcade-pair">
                        <dt>{seat === 0 ? "You" : `Computer ${seat}`}</dt>
                        <dd>{points(n)}</dd>
                      </div>
                    ))}
                </dl>
                <div className="arcade-row">
                  <button type="button" className="primary" autoFocus onClick={() => setRun((n) => n + 1)}>
                    Play again
                  </button>
                  <button type="button" className="secondary" onClick={onLeave}>
                    Change the rules
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
        {market && (
          <div className="arcade-market">
            <div className="arcade-till">
              <div className="arcade-cell">
                <small>In the bank</small>
                <b className="arcade-bank" ref={bankEl}>
                  0
                </b>
              </div>
              <div className="arcade-cell">
                <small>A second</small>
                <b>{shortly(market.perSecond)}</b>
              </div>
              <div className="arcade-cell">
                <small>A tap</small>
                <b>{shortly(market.perTap)}</b>
              </div>
              <span className="arcade-grow" />
              {market.badges.map((b) => (
                <span key={b.key} className="arcade-badge" data-tone={b.tone}>
                  {b.label}
                </span>
              ))}
            </div>
            <div className="arcade-goods">
              {groups.map((group) => (
                <section key={group} aria-label={group}>
                  <h3>{group}</h3>
                  {market.items
                    .filter((i) => i.group === group)
                    .map((item) => (
                      <button key={item.key} type="button" className="arcade-good" disabled={!item.can || !!ending} onClick={() => controls.order?.(item.key)}>
                        <span className="arcade-good-name">
                          <b>{item.label}</b>
                          <small>{item.hint}</small>
                        </span>
                        {item.owned !== undefined && <span className="arcade-owned">{item.owned}</span>}
                        {item.cost > 0 && <span className="arcade-cost">{shortly(item.cost)}</span>}
                      </button>
                    ))}
                </section>
              ))}
            </div>
          </div>
        )}
        {build && !ending && (
          <div className="arcade-shop">
            {standing ? (
              <>
                <div className="arcade-cell arcade-about">
                  <small>
                    Level {standing.level} of {standing.maxLevel}
                  </small>
                  <b>{standing.label}</b>
                </div>
                <span className="arcade-grow" />
                <button type="button" className="arcade-btn buy" disabled={standing.upgrade === null || standing.upgrade > build.bank} onClick={() => controls.order?.("upgrade", standing.col, standing.row)}>
                  {standing.upgrade === null ? "Fully upgraded" : `Upgrade · ${standing.upgrade}`}
                </button>
                <button
                  type="button"
                  className="arcade-btn"
                  onClick={() => {
                    controls.order?.("sell", standing.col, standing.row);
                    setChosen(null);
                  }}
                >
                  Sell · {standing.sell}
                </button>
                <button type="button" className="arcade-btn" aria-label="Back to the shop" onClick={() => setChosen(null)}>
                  ✕
                </button>
              </>
            ) : (
              build.shop.map((item, i) => (
                <button key={item.key} type="button" className="arcade-btn item" data-tone={item.tone} aria-pressed={pick === item.key} disabled={item.cost > build.bank} title={`${item.hint} (key ${i + 1})`} onClick={() => setPick(item.key)}>
                  <b>{item.label}</b>
                  <small>{item.cost}</small>
                </button>
              ))
            )}
          </div>
        )}
        <div className="arcade-rail low">
          {build ? (
            <>
              <div className="arcade-cell">
                <small>Lives</small>
                <b className="arcade-hearts">♥ {build.lives}</b>
              </div>
              <div className="arcade-cell">
                <small>Gold</small>
                <b className="arcade-best">{points(build.bank)}</b>
              </div>
              {build.next && !ending && (
                <button type="button" className="arcade-btn send" title={build.next.preview} onClick={() => controls.order?.("send")}>
                  <b>
                    Send wave {build.next.wave}
                    {build.next.bonus > 0 ? ` · +${build.next.bonus}` : ""}
                  </b>
                  <small>
                    {build.next.preview} · {Math.ceil(build.next.inTicks / game.rate)}s
                  </small>
                </button>
              )}
            </>
          ) : market ? null : (
            <div className="arcade-cell">
              <small>Ships</small>
              <b className="arcade-lives">{"▲".repeat(Math.max(0, hud.lives - 1)) || "–"}</b>
            </div>
          )}
          {!build && !market && cells.map(({ stat: s, meter }) => (
            <div className="arcade-cell" key={s.key}>
              <small>{s.label}</small>
              {s.key === "multiplier" ? (
                <b data-hot={s.value >= 8 ? 2 : s.value >= 3 ? 1 : 0}>×{s.value}</b>
              ) : (
                <b className={`arcade-pips ${s.key}`} aria-label={`${s.value}${s.max ? ` of ${s.max}` : ""}`}>
                  {"●".repeat(s.value) || "–"}
                </b>
              )}
              {meter?.max && <div className="arcade-bar" role="img" aria-label={`${meter.label}: ${Math.round((meter.value * 100) / meter.max)}%`} style={{ ["--fill" as string]: `${(meter.value * 100) / meter.max}%` }} />}
            </div>
          ))}
          <span className="arcade-grow" />
          {controls.specialLabel && (
            <button type="button" className="arcade-btn special" onPointerDown={(e) => (e.preventDefault(), controls.special())}>
              {controls.specialLabel}
            </button>
          )}
          <button type="button" className="arcade-btn" onClick={() => !ending && setPaused((p) => !p)}>
            {paused ? "Carry on" : "Pause"}
          </button>
          <button type="button" className="arcade-btn" aria-pressed={sound} aria-label={sound ? "Turn sounds off" : "Turn sounds on"} onClick={toggleSound}>
            {sound ? "🔊" : "🔇"}
          </button>
        </div>
      </div>
    </main>
  );
}
