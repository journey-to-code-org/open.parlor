// The mountain road: a run from one end of it to the other, from behind the car or from the
// driver's seat. The run is the engine's (`mountainRoad` from open.games), stepped here sixty times
// a second; you are seat 0, and a rival, when there is one, is a computer driver in seat 1.
//
// Over the road is what a driver needs to know: the leg and the clock, the fuel and the damage, a
// radar detector that lights before the patrol car is in sight, and, when it is behind you, how far.
// Glass that has been hit stays cracked.
import { CAR_MODELS, oilStarved, mountainRoad, mountainRoadResults, specOf, type ArcadeRoad, type ArcadeView, type Build, type MountainRoadInput, type MountainRoadResult, type MountainRoadRules, type MountainRoadState } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";
import { arcadeAudio, blip, crash, notes, wakeArcadeSound } from "../arcade/sounds";
import { motionSetting, wants3d } from "../display";
import { loadDriveSeat, saveDriveSeat } from "../storage";
import { loadRoad3d, type Road3d } from "./road3d";
import type { Rival } from "./Strip";

export interface RoadOutcome {
  mine: MountainRoadResult;
  theirs: MountainRoadResult | null;
  forfeit: boolean;
}

const RATE = mountainRoad.rate;
const TONES = ["#4cc9ff", "#ff5a6e"];
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${Math.floor(ms / 100) % 10}`;
type Driver = ArcadeRoad["drivers"][number];

/** The road from straight above, for a device with no 3-D: a window that moves with your car. */
function drawFlat(g: CanvasRenderingContext2D, w: number, h: number, road: ArcadeRoad) {
  const me = road.drivers[0]!;
  g.fillStyle = "#5f6b3e";
  g.fillRect(0, 0, w, h);
  const scale = Math.min(w / 16000, h / 260000);
  const x = (across: number) => w / 2 + across * scale * 1.6;
  const y = (along: number) => h * 0.78 - (along - me.along) * (h / 260000);
  g.fillStyle = "#7d6a58";
  g.fillRect(x(road.wall), 0, w, h);
  g.fillStyle = "#2c3324";
  g.fillRect(0, 0, x(road.drop), h);
  g.fillStyle = "#3a3a40";
  g.fillRect(x(-road.halfWidth), 0, x(road.halfWidth) - x(-road.halfWidth), h);
  g.fillStyle = "#e3b62c";
  g.fillRect(x(0) - 1, 0, 3, h);
  for (const s of road.stations) {
    g.fillStyle = "#f4f0e6";
    g.fillRect(x(-road.halfWidth), y(s), x(road.halfWidth) - x(-road.halfWidth), 4);
  }
  const car = (along: number, across: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(x(across) - 9, y(along) - 16, 18, 32);
  };
  for (const t of road.traffic) car(t.along, t.across, "#c9c4b4");
  for (const p of road.patrols) car(p.along, p.across, p.lit ? "#3a6cff" : "#15171c");
  road.drivers.forEach((d, seat) => d.staged && car(d.along, d.across, TONES[seat]!));
}

function drawOver(g: CanvasRenderingContext2D, w: number, h: number, road: ArcadeRoad, tick: number, gauges: boolean) {
  const me = road.drivers[0]!;
  // Glass that has been hit: cracks from where it was struck, more of them the worse it is.
  if (me.damage >= 150) {
    const cx = w * 0.3, cy = h * 0.3;
    g.strokeStyle = "rgba(255, 255, 255, 0.5)";
    g.lineWidth = 1.2;
    const rays = Math.min(22, 4 + Math.floor(me.damage / 45));
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + (i % 3) * 0.2;
      const len = (0.08 + ((i * 37) % 11) / 40) * Math.min(w, h) * (0.5 + me.damage / 1000);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * len * 0.5 + ((i * 13) % 9) - 4, cy + Math.sin(a) * len * 0.5);
      g.lineTo(cx + Math.cos(a + 0.12) * len, cy + Math.sin(a + 0.12) * len);
      g.stroke();
    }
  }
  // Where everyone is on the road, and where the stations are.
  const barW = Math.min(w - 40, 520);
  const bx = (w - barW) / 2;
  g.fillStyle = "rgba(0, 0, 0, 0.45)";
  g.fillRect(bx - 6, 10, barW + 12, 16);
  g.fillStyle = "rgba(255, 255, 255, 0.3)";
  g.fillRect(bx, 17, barW, 3);
  for (const s of road.stations) g.fillRect(bx + (barW * s) / road.length - 1, 12, 2, 12);
  road.drivers.forEach((d, seat) => {
    g.fillStyle = TONES[seat]!;
    g.beginPath();
    g.arc(bx + (barW * Math.min(d.along, road.length)) / road.length, 18, 5, 0, Math.PI * 2);
    g.fill();
  });
  // The panel: leg and clock, then the tank and the state of the car.
  const px = 12, py = 78, pw = Math.min(210, w * 0.5);
  g.fillStyle = "rgba(8, 9, 14, 0.72)";
  g.beginPath();
  g.roundRect(px, py, pw, 126, 10);
  g.fill();
  g.fillStyle = "#eef1f6";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.font = "700 22px system-ui, sans-serif";
  g.fillText(clock(me.time + me.penalty), px + 12, py + 28);
  g.font = "600 12px system-ui, sans-serif";
  g.fillStyle = "#98a2b6";
  g.fillText(`LEG ${me.stage + 1} OF ${road.stations.length}${me.penalty ? `  ·  +${Math.round(me.penalty / 1000)}s` : ""}`, px + 12, py + 46);
  const bar = (row: number, label: string, share: number, colour: string) => {
    g.fillStyle = "#98a2b6";
    g.fillText(label, px + 12, py + 66 + row * 22);
    g.fillStyle = "rgba(255, 255, 255, 0.14)";
    g.fillRect(px + 70, py + 58 + row * 22, pw - 84, 8);
    g.fillStyle = colour;
    g.fillRect(px + 70, py + 58 + row * 22, ((pw - 84) * Math.max(0, Math.min(1000, share))) / 1000, 8);
  };
  bar(0, "FUEL", me.fuel, me.fuel < 200 ? "#ff3b3b" : "#ffb627");
  bar(1, "DAMAGE", me.damage, me.damage > 600 ? "#ff3b3b" : "#c9ccd2");
  const starved = oilStarved(me.oil, me.rpm);
  bar(2, `OIL ${me.oil}`, me.oil * 10, starved ? "#ff3b3b" : "#ffb627");
  // The detector, and the law.
  const rx = 12, ry = 212;
  g.fillStyle = "rgba(8, 9, 14, 0.72)";
  g.beginPath();
  g.roundRect(rx, ry, 138, 44, 10);
  g.fill();
  g.fillStyle = "#98a2b6";
  g.fillText("RADAR", rx + 10, ry + 27);
  for (let i = 0; i < 3; i++) {
    const on = me.chase !== null ? Math.floor(tick / 6) % 2 === 0 : me.radar > i && (me.radar < 3 || Math.floor(tick / 8) % 2 === 0);
    g.fillStyle = on ? (me.chase !== null ? "#3a6cff" : "#ff3b3b") : "#262a34";
    g.beginPath();
    g.arc(rx + 74 + i * 22, ry + 22, 8, 0, Math.PI * 2);
    g.fill();
  }
  if (me.chase !== null) {
    g.textAlign = "center";
    g.font = "700 18px system-ui, sans-serif";
    g.fillStyle = Math.floor(tick / 15) % 2 ? "#ff5a5f" : "#6f95ff";
    g.fillText(`POLICE  ${Math.max(0, Math.round(me.chase / 1000))} m behind`, w / 2, 54);
    g.font = "600 13px system-ui, sans-serif";
    g.fillStyle = "#eef1f6";
    g.fillText("Stop on your side for a ticket, or lose him", w / 2, 72);
  }
  if (!gauges) return;
  // From behind the car there is no dash to read, so the speed and the revs go here.
  const top = me.redline + 1200;
  // On a phone it sits above the thumbs.
  const gx = w / 2, gy = h - (w < 560 ? 210 : 46), gw = Math.min(280, w * 0.5);
  g.fillStyle = "rgba(8, 9, 14, 0.72)";
  g.beginPath();
  g.roundRect(gx - gw / 2 - 12, gy - 40, gw + 24, 74, 12);
  g.fill();
  g.fillStyle = "rgba(255, 255, 255, 0.14)";
  g.fillRect(gx - gw / 2, gy + 12, gw, 10);
  g.fillStyle = me.rpm > me.redline ? "#ff3b3b" : me.rpm > me.redline - 350 ? "#ffcf3f" : "#55d68a";
  g.fillRect(gx - gw / 2, gy + 12, (gw * Math.min(me.rpm, top)) / top, 10);
  g.fillStyle = "#ff3b3b";
  g.fillRect(gx - gw / 2 + (gw * me.redline) / top, gy + 8, 2, 18);
  g.fillStyle = "#eef1f6";
  g.textAlign = "left";
  g.font = "700 30px system-ui, sans-serif";
  g.fillText(`${me.mph}`, gx - gw / 2, gy - 4);
  g.font = "600 12px system-ui, sans-serif";
  g.fillStyle = me.mph > road.limit + 10 ? "#ff5a5f" : "#98a2b6";
  g.fillText(`MPH · LIMIT ${road.limit}`, gx - gw / 2 + 62, gy - 6);
  g.textAlign = "right";
  g.fillStyle = "#eef1f6";
  g.font = "700 30px system-ui, sans-serif";
  g.fillText(me.gear === 0 ? "N" : me.auto ? "D" : String(me.gear), gx + gw / 2, gy - 4);
}

function engineNote() {
  const ctx = arcadeAudio();
  if (!ctx) return null;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  filter.type = "lowpass";
  gain.gain.value = 0;
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start();
  return {
    set(rpm: number, gas: number, live: boolean) {
      const t = ctx.currentTime;
      osc.frequency.setTargetAtTime(22 + rpm / 34, t, 0.03);
      filter.frequency.setTargetAtTime(300 + rpm / 4 + gas * 14, t, 0.05);
      gain.gain.setTargetAtTime(live ? 0.03 + gas * 0.0004 : 0, t, 0.06);
    },
    stop() {
      try {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        osc.stop(ctx.currentTime + 0.3);
      } catch {
        /* already stopped */
      }
    },
  };
}

export function Road({ rules, build, carName, rival, onDone }: { rules: MountainRoadRules; build: Build; carName: string; rival: Rival | null; onDone: (outcome: RoadOutcome | null) => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const glCanvas = useRef<HTMLCanvasElement | null>(null);
  const state = useRef<MountainRoadState | null>(null);
  const controls = useRef({ gas: 0, brake: 0, steer: 0, want: 0, gear: 0 });
  const [results, setResults] = useState<MountainRoadResult[] | null>(null);
  const [note, setNote] = useState("");
  const [seat, setSeat] = useState<"chase" | "cockpit">(loadDriveSeat);
  const seatNow = useRef(seat);
  seatNow.current = seat;
  const [solidShown, setSolidShown] = useState(false);
  const spec = specOf(build);
  const topGear = spec.auto ? 1 : spec.gears.length;
  const swapSeat = () => setSeat((was) => {
    const next = was === "chase" ? "cockpit" : "chase";
    saveDriveSeat(next);
    return next;
  });
  const shift = (by: number) => {
    wakeArcadeSound();
    const c = controls.current;
    c.gear = Math.max(0, Math.min(topGear, c.gear + by));
  };

  useEffect(() => {
    const s = mountainRoad.newGame(rules, rival ? 2 : 1, Math.floor(Math.random() * 2 ** 31));
    state.current = s;
    const cv = canvas.current!;
    const g = cv.getContext("2d")!;
    let sound: ReturnType<typeof engineNote> = null;
    let frame = 0, last = performance.now(), owed = 0, done = false, jolt = 0, noteUntil = 0;
    let gl: Road3d | null = null;
    let gone = false;
    if (wants3d("mountainroad") && glCanvas.current) {
      void loadRoad3d(glCanvas.current).then((made) => {
        if (gone) made?.dispose();
        else gl = made;
      });
    }
    const models = [build, ...(rival ? [rival.build] : [])].map((b) => CAR_MODELS[b[0]!]?.key ?? "sparrow");
    const size = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(cv.clientWidth * ratio);
      cv.height = Math.round(cv.clientHeight * ratio);
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    size();
    window.addEventListener("resize", size);
    // An automatic is in drive from the start; a manual starts in first.
    controls.current.gear = 1;

    const hear = (view: ArcadeView, now: number) => {
      for (const e of view.events) {
        if (e.seat !== undefined && e.seat !== 0) continue;
        if (e.kind === "crash" || e.kind === "scrape") {
          crash(e.kind === "crash" ? 0.7 : 0.25, 0.12);
          jolt = e.kind === "crash" ? 1 : 0.4;
        } else if (e.kind === "siren") blip(700, 0.5, "square", 0.06);
        else if (e.kind === "shift") blip(180, 0.05, "square", 0.04);
        else if (e.kind === "station" || e.kind === "home") notes([523, 659, 784], 70, 0.12);
        else if (e.kind === "escaped") notes([659, 880], 80, 0.1);
        if (e.text && e.kind !== "staged") {
          setNote(e.text);
          noteUntil = now + 3200;
        }
      }
    };
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      owed = Math.min(owed + ((now - last) * RATE) / 1000, 6);
      last = now;
      let view: ArcadeView | null = null;
      const c = controls.current;
      while (owed >= 1 && !done) {
        owed -= 1;
        // The wheel takes a moment to turn and a moment to come back.
        c.steer += Math.max(-9, Math.min(9, c.want - c.steer));
        const mine: MountainRoadInput = { gas: c.gas, brake: c.brake, steer: Math.round(c.steer), gear: c.gear, stage: true, build };
        const theirs = rival ? (s.drivers[1]!.staged ? mountainRoad.bot(s, 1, rival.style) : { ...mountainRoad.idle, stage: true, build: rival.build }) : null;
        mountainRoad.step(s, theirs ? [mine, theirs] : [mine]);
        view = mountainRoad.view(s);
        hear(view, now);
        // It is over for you when you are out, whatever the other car is still doing.
        if (view.over || view.road!.drivers[0]!.out) {
          done = true;
          setResults(mountainRoadResults(s));
        }
      }
      view ??= mountainRoad.view(s);
      const road = view.road!;
      const me: Driver = road.drivers[0]!;
      sound ??= engineNote();
      sound?.set(me.rpm, c.gas, !done && !me.resting);
      if (me.radar && !done && Math.floor(now / (me.radar === 3 ? 180 : me.radar === 2 ? 380 : 800)) !== Math.floor((now - 17) / (me.radar === 3 ? 180 : me.radar === 2 ? 380 : 800))) blip(1900, 0.04, "square", 0.03);
      if (noteUntil && now > noteUntil) {
        noteUntil = 0;
        setNote("");
      }
      jolt = Math.max(0, jolt - 0.04);
      const inside = seatNow.current === "cockpit";
      const solid = !!gl && gl.render({ road, cars: models, tones: TONES, width: cv.clientWidth, height: cv.clientHeight, dpr: Math.min(2, window.devicePixelRatio || 1), time: now, still: motionSetting() !== "on", seat: seatNow.current, steer: c.steer / 100, jolt });
      setSolidShown((was) => (was === solid ? was : solid));
      if (glCanvas.current) glCanvas.current.style.visibility = solid ? "visible" : "hidden";
      g.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
      if (!solid) drawFlat(g, cv.clientWidth, cv.clientHeight, road);
      drawOver(g, cv.clientWidth, cv.clientHeight, road, s.tick, !(solid && inside));
    };
    frame = requestAnimationFrame(loop);

    const keys = new Set<string>();
    const read = () => {
      const c = controls.current;
      c.gas = keys.has("gas") ? 100 : 0;
      c.brake = keys.has("brake") ? 100 : 0;
      c.want = (keys.has("right") ? 100 : 0) - (keys.has("left") ? 100 : 0);
    };
    const named = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      return k === "ArrowUp" || k === "w" ? "gas" : k === "ArrowDown" || k === "s" ? "brake" : k === "ArrowLeft" || k === "a" ? "left" : k === "ArrowRight" || k === "d" ? "right" : k === " " || k === "e" ? "up" : k === "q" ? "down" : k === "c" ? "seat" : "";
    };
    const down = (e: KeyboardEvent) => {
      const k = named(e);
      if (!k) return;
      e.preventDefault();
      wakeArcadeSound();
      if (e.repeat) return;
      if (k === "up") shift(1);
      else if (k === "down") shift(-1);
      else if (k === "seat") swapSeat();
      else {
        keys.add(k);
        read();
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(named(e));
      read();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      cancelAnimationFrame(frame);
      gone = true;
      gl?.dispose();
      sound?.stop();
      window.removeEventListener("resize", size);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // One run for the life of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The wheel, for a thumb: where it is across the pad is how far the wheel is turned. */
  const wheel = (e: React.PointerEvent<HTMLDivElement>) => {
    wakeArcadeSound();
    const box = e.currentTarget.getBoundingClientRect();
    controls.current.want = Math.round(Math.max(-100, Math.min(100, (((e.clientX - box.left) / box.width) * 2 - 1) * 130)));
  };
  const pedal = (which: "gas" | "brake", amount: number) => {
    wakeArcadeSound();
    controls.current[which] = amount;
  };
  const leave = () => {
    const s = state.current;
    if (!s || results) return;
    if (s.phase === "staging") return onDone(null);
    const run = mountainRoadResults(s);
    onDone({ mine: { ...run[0]!, won: false }, theirs: run[1] ?? null, forfeit: true });
  };

  const mine = results?.[0];
  const theirs = results?.[1] ?? null;
  const ended = { finished: "Made it", wrecked: "Wrecked", edge: "Over the edge", fuel: "Out of gas" } as const;
  return (
    <div className="pinks-strip pinks-road">
      <canvas ref={glCanvas} className="gl" />
      <canvas ref={canvas} />
      <div className="pinks-strip-top">
        <button type="button" onClick={leave} disabled={!!results}>{rival && rival.stake > 0 ? "Forfeit" : "Turn back"}</button>
        {solidShown && <button type="button" onClick={swapSeat} aria-label="Change the view">{seat === "chase" ? "Get in" : "Step back"}</button>}
        <span>{rules.name} · {carName}{rival ? ` against ${rival.name}` : ""}</span>
      </div>
      {note && !results && <div className="pinks-banner small" key={note}>{note}</div>}
      {!results && (
        <div className="pinks-pads">
          <div className="steer" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); wheel(e); }} onPointerMove={(e) => e.buttons && wheel(e)} onPointerUp={() => (controls.current.want = 0)} onPointerCancel={() => (controls.current.want = 0)} role="slider" aria-label="Steering" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={0} tabIndex={0}>
            ◀ Steer ▶
          </div>
          <div className="feet">
            <div className="shifter row">
              <button type="button" onPointerDown={() => shift(-1)} aria-label="Shift down">▼</button>
              <button type="button" onPointerDown={() => shift(1)} aria-label="Shift up">▲</button>
            </div>
            <div className="row">
              <button type="button" className="pedal brake" aria-label="Brake" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pedal("brake", 100); }} onPointerUp={() => pedal("brake", 0)} onPointerCancel={() => pedal("brake", 0)}>Brake</button>
              <button type="button" className="pedal" aria-label="Throttle" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pedal("gas", 100); }} onPointerUp={() => pedal("gas", 0)} onPointerCancel={() => pedal("gas", 0)}>Gas</button>
            </div>
          </div>
        </div>
      )}
      {mine && (
        <div className="pinks-slip" role="dialog" aria-label="Result">
          <h2 className={mine.out === "finished" ? "won" : ""}>{rival ? (mine.won ? "You win" : theirs?.won ? "You lose" : "Nobody wins") : ended[mine.out ?? "wrecked"]}</h2>
          {rival && rival.stake > 0 && <p className="money">{mine.won ? `+$${rival.stake.toLocaleString("en-US")}` : theirs?.won ? `-$${rival.stake.toLocaleString("en-US")}` : "Stakes back"}</p>}
          <table>
            <tbody>
              <tr><th>How it ended</th><td>{ended[mine.out ?? "wrecked"] ?? "Still out there"}</td></tr>
              <tr><th>Distance</th><td>{(mine.distance / 1000).toFixed(1)} km</td></tr>
              <tr><th>Time</th><td>{clock(mine.time)}</td></tr>
              {mine.legs.map((leg, i) => <tr key={i}><th>Leg {i + 1}</th><td>{clock(leg)} · {Math.round((rules.stageLength / (leg / 1000)) * 2.237)} mph</td></tr>)}
              <tr><th>Fines</th><td>${mine.fines}</td></tr>
              <tr><th>Damage</th><td>{Math.round(mine.damage / 10)}%</td></tr>
            </tbody>
          </table>
          <button type="button" className="yes" onClick={() => onDone({ mine, theirs, forfeit: false })}>Back to the garage</button>
        </div>
      )}
    </div>
  );
}
