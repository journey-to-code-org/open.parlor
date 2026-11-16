// The strip: one race, seen from behind your own car. The road runs away to a horizon, the tree
// stands between the lanes, and the other lane's car is wherever it really is: beside you, a
// length ahead, or gone. Under it all is what you drive by: a tachometer with the redline marked,
// the gear, the speed, and a light that says shift.
//
// The race is the engine's (`pinkSlips` from open.games), stepped here sixty times a second. Your
// lane is seat 0; the other lane, when there is one, is a computer driver in seat 1.
import { CAR_MODELS, oilStarved, pinkSlips, pinkSlipsResults, specOf, type ArcadeView, type Build, type PinkSlipsInput, type PinkSlipsResult, type PinkSlipsRules, type PinkSlipsState } from "@journey-to-code/games";
import type { PlayStyle } from "@journey-to-code/rules";
import { useEffect, useRef, useState } from "react";
import { arcadeAudio, blip, crash, notes, wakeArcadeSound } from "../arcade/sounds";
import { motionSetting, wants3d } from "../display";
import { loadDriveSeat, saveDriveSeat } from "../storage";
import { loadStrip3d, type Strip3d } from "./strip3d";

export interface Rival {
  name: string;
  build: Build;
  style: PlayStyle;
  /** What is riding on it, in dollars. */
  stake: number;
}

export interface StripOutcome {
  mine: PinkSlipsResult;
  theirs: PinkSlipsResult | null;
  /** Walked away once the cars were on the line. */
  forfeit: boolean;
}

const RATE = pinkSlips.rate;
const LANE = 4.6;
/** The camera: metres behind your bumper, and metres off the ground. */
const BACK = 7.5;
const UP = 2.3;
const TONES = ["#4cc9ff", "#ff5a6e"];
const slip = (ms: number | null) => (ms === null ? "—" : (ms / 1000).toFixed(3));

type Lane = NonNullable<ArcadeView["race"]>["lanes"][number];

/**
 * Draw a frame. When the road has been drawn in 3-D underneath (`solid`), only what lies over it is
 * drawn here: how far along everyone is, the start lights and the dashboard.
 */
function draw(g: CanvasRenderingContext2D, w: number, h: number, view: ArcadeView, tick: number, solid: boolean, inside: boolean) {
  g.clearRect(0, 0, w, h);
  const race = view.race!;
  const me = race.lanes[0]!;
  const lanes = race.lanes.length;
  const myZ = me.distance / 1000;
  const hor = Math.round(h * 0.4);
  // Wide enough to see every lane on a narrow screen, and no closer than the height allows on a wide one.
  const f = Math.min(((h * 0.74 - hor) * BACK) / UP, ((w / 2 - 8) * BACK) / ((race.lanes.length * LANE) / 2 + 1));
  // On a narrow screen the camera climbs, so the cars stay where the thumbs are not.
  const eye = ((h * 0.74 - hor) * BACK) / f;
  const cx = w / 2;
  /** Where a point in the world lands: metres across from the middle of the road, metres up, metres down the strip. */
  const at = (x: number, up: number, z: number): [number, number, number] => {
    const d = Math.max(0.4, z - myZ + BACK);
    return [cx + (f * x) / d, hor + (f * (eye - up)) / d, f / d];
  };
  const laneX = (seat: number) => (seat * 2 - (lanes - 1)) * (LANE / 2);
  const edge = (lanes * LANE) / 2 + 1.2;

  if (!solid) {
  // The night, and a town a long way off.
  const sky = g.createLinearGradient(0, 0, 0, hor);
  sky.addColorStop(0, "#0b0a18");
  sky.addColorStop(1, "#3a1f4a");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, hor);
  g.fillStyle = "#ffcf7a";
  for (let i = 0; i < 40; i++) g.fillRect(((i * 7919) % 997) / 997 * w, hor - 3 - ((i * 104729) % 5), 2, 2);
  g.fillStyle = "#15171c";
  g.fillRect(0, hor, w, h - hor);

  // The road.
  const near = myZ - BACK + 0.6;
  const far = myZ + 600;
  const quad = (x1: number, x2: number, z1: number, z2: number, fill: string) => {
    const a = at(x1, 0, z1), b = at(x2, 0, z1), c = at(x2, 0, z2), d = at(x1, 0, z2);
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.lineTo(c[0], c[1]);
    g.lineTo(d[0], d[1]);
    g.fill();
  };
  quad(-edge, edge, near, far, "#2b2a33");
  quad(-edge - 0.3, -edge, near, far, "#d8d2c0");
  quad(edge, edge + 0.3, near, far, "#d8d2c0");
  // The lines between lanes: dashes, which is how you see your speed.
  const first = Math.floor(near / 12) * 12;
  for (let z = first; z < myZ + 320; z += 12) {
    if (z + 4 < near) continue;
    for (let l = 1; l < lanes; l++) quad(laneX(l) - LANE / 2 - 0.09, laneX(l) - LANE / 2 + 0.09, Math.max(near, z), z + 4, "#e8e2d0");
  }
  // The start, and the line at the other end.
  const line = race.distance / 1000;
  if (near < 0.5) quad(-edge, edge, Math.max(near, 0), 0.5, "#f4f0e6");
  if (line < far) {
    for (let i = 0; i < 12; i++) quad(-edge + (i * edge) / 6, -edge + ((i + 1) * edge) / 6, line, line + 1.4, i % 2 ? "#f4f0e6" : "#111");
    const [lx, ly, k] = at(-edge, 6, line);
    const [rx] = at(edge, 6, line);
    if (k * 6 > 4) {
      g.fillStyle = "#c8323c";
      g.fillRect(lx, ly, rx - lx, Math.max(2, k * 1.1));
      g.fillStyle = "#8b97b8";
      g.fillRect(lx - k * 0.1, ly, Math.max(1, k * 0.2), k * 6);
      g.fillRect(rx - k * 0.1, ly, Math.max(1, k * 0.2), k * 6);
    }
  }
  // Lamp posts down both sides.
  for (let z = Math.floor(far / 40) * 40; z >= near; z -= 40) {
    if (z < near + 1) continue;
    for (const side of [-1, 1]) {
      const [px, py, k] = at(side * (edge + 2.5), 0, z);
      if (k < 0.6) continue;
      g.fillStyle = "#555c6e";
      g.fillRect(px - k * 0.08, py - k * 7, Math.max(1, k * 0.16), k * 7);
      g.fillStyle = "rgba(255, 214, 140, 0.9)";
      g.beginPath();
      g.arc(px - side * k * 0.8, py - k * 7, Math.max(1.2, k * 0.35), 0, Math.PI * 2);
      g.fill();
    }
  }

  // The tree, just past the start line.
  const treeX = lanes > 1 ? 0 : LANE / 2 + 0.6;
  const treeZ = 14;
  if (treeZ - myZ + BACK > 5) {
    const [tx, ty, k] = at(treeX, 0, treeZ);
    g.fillStyle = "#3b4150";
    g.fillRect(tx - k * 0.07, ty - k * 3.6, Math.max(2, k * 0.14), k * 3.6);
    g.fillRect(tx - k * 0.42, ty - k * 3.8, k * 0.84, k * 2.5);
    const lamp = (row: number, on: boolean, colour: string) => {
      g.fillStyle = on ? colour : "#1c1f27";
      g.shadowColor = colour;
      g.shadowBlur = on ? k * 0.5 : 0;
      g.beginPath();
      g.arc(tx, ty - k * (3.5 - row * 0.48), Math.max(2.5, k * 0.2), 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    };
    race.tree.ambers.forEach((on, i) => lamp(i, on, "#ffb627"));
    lamp(3, race.tree.green, "#55d68a");
    lamp(4, race.lanes.some((l) => l.foul), "#ff3b3b");
  }

  // The cars, furthest first.
  const car = (lane: Lane, seat: number) => {
    const z = lane.distance / 1000;
    if (z - myZ + BACK < 1.2) return;
    const [x, y, k] = at(laneX(seat), 0, z);
    if (k < 0.5) return;
    const tone = TONES[seat % TONES.length]!;
    const shake = lane.spinning ? Math.sin(tick * 1.7 + seat) * k * 0.03 : 0;
    const left = x - k * 0.9 + shake;
    if (lane.spinning || lane.blown) {
      g.fillStyle = lane.blown ? "rgba(40, 40, 46, 0.55)" : "rgba(220, 220, 228, 0.28)";
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(x + Math.sin(tick * 0.4 + i * 2.1) * k * 0.9, y - k * (0.3 + ((tick * 0.05 + i * 0.37) % 1) * 1.6), k * (0.35 + (i % 3) * 0.18), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = "rgba(0, 0, 0, 0.45)";
    g.fillRect(left - k * 0.05, y - k * 0.08, k * 1.9, k * 0.16);
    g.fillStyle = "#0c0d10";
    g.fillRect(left, y - k * 0.5, k * 0.34, k * 0.5);
    g.fillRect(left + k * 1.46, y - k * 0.5, k * 0.34, k * 0.5);
    g.fillStyle = tone;
    g.beginPath();
    g.roundRect(left, y - k * 0.98, k * 1.8, k * 0.72, k * 0.1);
    g.fill();
    g.beginPath();
    g.roundRect(left + k * 0.22, y - k * 1.42, k * 1.36, k * 0.5, k * 0.12);
    g.fill();
    g.fillStyle = "rgba(10, 14, 24, 0.82)";
    g.beginPath();
    g.roundRect(left + k * 0.34, y - k * 1.34, k * 1.12, k * 0.34, k * 0.07);
    g.fill();
    g.fillStyle = lane.gear > 0 || lane.staged ? "#ff2d2d" : "#7a1717";
    g.fillRect(left + k * 0.1, y - k * 0.84, k * 0.36, k * 0.14);
    g.fillRect(left + k * 1.34, y - k * 0.84, k * 0.36, k * 0.14);
    g.fillStyle = "#1c1f27";
    g.fillRect(left + k * 0.1, y - k * 0.42, k * 1.6, k * 0.1);
  };
  race.lanes.map((lane, seat) => ({ lane, seat })).filter((e) => e.lane.staged).sort((a, b) => b.lane.distance - a.lane.distance).forEach((e) => car(e.lane, e.seat));

  }

  // How far along everyone is, across the top.
  const barW = Math.min(w - 40, 520);
  const bx = (w - barW) / 2;
  g.fillStyle = "rgba(255, 255, 255, 0.16)";
  g.fillRect(bx, 16, barW, 4);
  race.lanes.forEach((lane, seat) => {
    g.fillStyle = TONES[seat % TONES.length]!;
    g.beginPath();
    g.arc(bx + (barW * lane.distance) / race.distance, 18 + (seat ? 5 : -5), 5, 0, Math.PI * 2);
    g.fill();
  });

  // The lights again, where they cannot be missed: the tree itself is small on a phone and soon behind you.
  if (race.phase !== "over" && me.distance < 60_000) {
    const lights: [on: boolean, colour: string][] = [...race.tree.ambers.map((on): [boolean, string] => [on, "#ffb627"]), [race.tree.green, "#55d68a"], [me.foul, "#ff3b3b"]];
    const lr = Math.max(9, Math.min(16, w * 0.022));
    const lx = cx - (lights.length - 1) * lr * 1.4;
    g.fillStyle = "rgba(8, 9, 14, 0.78)";
    g.beginPath();
    g.roundRect(lx - lr * 1.8, 70 - lr * 1.6, (lights.length - 1) * lr * 2.8 + lr * 3.6, lr * 3.2, lr);
    g.fill();
    lights.forEach(([on, colour], i) => {
      g.fillStyle = on ? colour : "#262a34";
      g.shadowColor = colour;
      g.shadowBlur = on ? lr : 0;
      g.beginPath();
      g.arc(lx + i * lr * 2.8, 70, lr, 0, Math.PI * 2);
      g.fill();
    });
    g.shadowBlur = 0;
  }

  // From the driver's seat the gauges are on the dash, in the scene.
  if (solid && inside) return;

  // The dashboard.
  const r = Math.min(w * 0.19, h * 0.17, 120);
  // On a phone the tachometer sits between the shifter and the pedal, with the speed above it.
  const narrow = w < 560;
  const gx = narrow ? w / 2 : Math.max(r + 14, w / 2 - r * 1.5);
  const gy = h - r * 0.86;
  const dash = g.createLinearGradient(0, h - r * 2.3, 0, h);
  dash.addColorStop(0, "rgba(8, 9, 14, 0)");
  dash.addColorStop(0.45, solid ? "rgba(8, 9, 14, 0.5)" : "rgba(8, 9, 14, 0.82)");
  dash.addColorStop(1, solid ? "rgba(8, 9, 14, 0.85)" : "rgba(8, 9, 14, 0.96)");
  g.fillStyle = dash;
  g.fillRect(0, h - r * 2.3, w, r * 2.3);
  const top = me.redline + 1200;
  const angle = (rpm: number) => Math.PI * 0.8 + (Math.min(rpm, top) / top) * Math.PI * 1.4;
  g.fillStyle = "rgba(8, 9, 14, 0.86)";
  g.beginPath();
  g.arc(gx, gy, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = r * 0.09;
  g.strokeStyle = "#454d60";
  g.beginPath();
  g.arc(gx, gy, r * 0.84, angle(0), angle(me.redline));
  g.stroke();
  g.strokeStyle = "#ff3b3b";
  g.beginPath();
  g.arc(gx, gy, r * 0.84, angle(me.redline), angle(top));
  g.stroke();
  g.fillStyle = "#cfd6e4";
  g.font = `600 ${Math.round(r * 0.15)}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let rpm = 0; rpm <= top; rpm += 1000) g.fillText(String(rpm / 1000), gx + Math.cos(angle(rpm)) * r * 0.64, gy + Math.sin(angle(rpm)) * r * 0.64);
  g.strokeStyle = me.blown ? "#666" : "#ffcf3f";
  g.lineWidth = Math.max(2, r * 0.045);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(gx, gy);
  g.lineTo(gx + Math.cos(angle(me.rpm)) * r * 0.78, gy + Math.sin(angle(me.rpm)) * r * 0.78);
  g.stroke();
  g.lineCap = "butt";
  g.fillStyle = "#eef1f6";
  g.font = `700 ${Math.round(r * 0.42)}px system-ui, sans-serif`;
  g.fillText(me.gear === 0 ? "N" : me.auto ? "D" : String(me.gear), gx, gy + r * 0.34);
  // The shift light.
  const due = !me.blown && me.gear > 0 && me.rpm >= me.redline - 350;
  g.fillStyle = due ? (me.rpm > me.redline ? "#ff3b3b" : "#ffcf3f") : "#22262f";
  g.shadowColor = "#ffcf3f";
  g.shadowBlur = due ? r * 0.3 : 0;
  g.beginPath();
  g.arc(gx + r * 0.92, gy - r * 0.92, r * 0.16, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  // Speed, and the small gauges.
  const sx = gx + r * 1.35;
  g.fillStyle = "#eef1f6";
  if (narrow) {
    g.textAlign = "center";
    g.font = `700 ${Math.round(r * 0.5)}px system-ui, sans-serif`;
    g.fillText(`${me.mph} mph`, gx, gy - r * 1.4);
  } else {
    g.textAlign = "left";
    g.font = `700 ${Math.round(r * 0.62)}px system-ui, sans-serif`;
    g.fillText(String(me.mph), sx, gy - r * 0.1);
    g.font = `600 ${Math.round(r * 0.17)}px system-ui, sans-serif`;
    g.fillStyle = "#98a2b6";
    g.fillText("MPH", sx + r * 0.04, gy + r * 0.3);
  }
  g.textAlign = "left";
  g.font = `600 ${Math.round(r * 0.17)}px system-ui, sans-serif`;
  const meter = (row: number, label: string, share: number, colour: string) => {
    const mx = sx + r * 1.25;
    const my = gy - r * 0.5 + row * r * 0.38;
    g.fillStyle = "#98a2b6";
    g.fillText(label, mx, my - r * 0.14);
    g.fillStyle = "rgba(255, 255, 255, 0.14)";
    g.fillRect(mx, my, r * 1.1, r * 0.1);
    g.fillStyle = colour;
    g.fillRect(mx, my, (r * 1.1 * Math.min(1000, share)) / 1000, r * 0.1);
  };
  if (w > 520) {
    meter(0, me.heat > 600 ? "ENGINE: HOT" : "ENGINE", me.heat, me.heat > 600 ? "#ff3b3b" : "#55d68a");
    // Oil pressure against what the engine wants at these revs: short of it, the bar goes red.
    const starved = !me.blown && oilStarved(me.oil, me.rpm);
    meter(1, `OIL ${me.oil} PSI${starved ? ": LOW" : ""}`, me.oil * 10, starved ? "#ff3b3b" : "#ffb627");
    if (me.boost !== null) meter(2, "BOOST", me.boost, "#4cc9ff");
    g.fillStyle = me.afr > 128 ? "#ff5a5f" : me.afr < 112 ? "#6f95ff" : "#98a2b6";
    g.fillText(`AFR ${(me.afr / 10).toFixed(1)}`, sx + r * 1.25, gy - r * 0.5 + (me.boost !== null ? 3 : 2) * r * 0.38 - r * 0.14);
  }
  if (me.spinning) {
    g.fillStyle = "#ffcf3f";
    g.textAlign = "center";
    g.fillText("WHEELSPIN", gx, gy - r * (narrow ? 1.85 : 1.16));
  }
}

/** A held tone that follows the revs. */
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
      gain.gain.setTargetAtTime(live ? 0.035 + gas * 0.0005 : 0, t, 0.06);
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

export function Strip({ rules, build, carName, rival, onDone }: { rules: PinkSlipsRules; build: Build; carName: string; rival: Rival | null; onDone: (outcome: StripOutcome | null) => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const glCanvas = useRef<HTMLCanvasElement | null>(null);
  const state = useRef<PinkSlipsState | null>(null);
  const controls = useRef({ gas: 0, gear: 0 });
  const [results, setResults] = useState<PinkSlipsResult[] | null>(null);
  const [banner, setBanner] = useState("");
  const [gearShown, setGearShown] = useState(0);
  const [seat, setSeat] = useState<"chase" | "cockpit">(loadDriveSeat);
  const seatNow = useRef(seat);
  seatNow.current = seat;
  const [solidShown, setSolidShown] = useState(false);
  const swapSeat = () => setSeat((was) => {
    const next = was === "chase" ? "cockpit" : "chase";
    saveDriveSeat(next);
    return next;
  });
  const spec = specOf(build);
  const topGear = spec.auto ? 1 : spec.gears.length;

  const shift = (by: number) => {
    wakeArcadeSound();
    const c = controls.current;
    const to = Math.max(0, Math.min(topGear, c.gear + by));
    if (to === c.gear) return;
    c.gear = to;
    setGearShown(to);
  };
  const gas = (amount: number) => {
    wakeArcadeSound();
    controls.current.gas = amount;
  };

  useEffect(() => {
    const seats = rival ? 2 : 1;
    const s = pinkSlips.newGame(rules, seats, Math.floor(Math.random() * 2 ** 31));
    state.current = s;
    const cv = canvas.current!;
    const g = cv.getContext("2d")!;
    let note: ReturnType<typeof engineNote> = null;
    let frame = 0;
    let last = performance.now();
    let owed = 0;
    let done = false;
    // The road in 3-D, where the device can and the display setting asks for it.
    let gl: Strip3d | null = null;
    let gone = false;
    if (wants3d("pinkslips") && glCanvas.current) {
      void loadStrip3d(glCanvas.current).then((made) => {
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

    const hear = (view: ArcadeView) => {
      for (const e of view.events) {
        const mine = e.seat === 0 || e.seat === undefined;
        if (e.kind === "amber") blip(440, 0.12, "square", 0.05);
        else if (e.kind === "green") blip(880, 0.3, "square", 0.06);
        else if (e.kind === "redlight") blip(140, 0.6, "sawtooth", 0.08);
        else if (e.kind === "shift" && mine) blip(180, 0.05, "square", 0.04);
        else if (e.kind === "spin" && mine) crash(0.5, 0.05);
        else if (e.kind === "blown") crash(1.2, mine ? 0.14 : 0.06);
        else if (e.kind === "home" && mine) notes([523, 659, 784], 70, 0.12);
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      owed = Math.min(owed + ((now - last) * RATE) / 1000, 6);
      last = now;
      let view: ArcadeView | null = null;
      while (owed >= 1 && !done) {
        owed -= 1;
        const c = controls.current;
        // From a roll the car is already in a gear: the shifter starts from there, not from neutral.
        if (rules.tree === "roll" && c.gear === 0 && s.lanes[0]!.car.gear > 0) {
          c.gear = s.lanes[0]!.car.gear;
          setGearShown(c.gear);
        }
        const mine: PinkSlipsInput = { gas: c.gas, gear: c.gear, stage: true, build };
        const theirs = rival ? (s.lanes[1]!.staged ? pinkSlips.bot(s, 1, rival.style) : { gas: 0, gear: 0, stage: true, build: rival.build }) : null;
        pinkSlips.step(s, theirs ? [mine, theirs] : [mine]);
        view = pinkSlips.view(s);
        hear(view);
        if (view.over) {
          done = true;
          setResults(pinkSlipsResults(s));
        }
      }
      view ??= pinkSlips.view(s);
      note ??= engineNote();
      const me = view.race!.lanes[0]!;
      note?.set(me.rpm, controls.current.gas, !done && !me.blown);
      const words = rules.tree === "roll" && (view.race!.phase === "ready" || view.race!.phase === "tree") ? `Rolling at ${rules.roll}. Pick your gear, and wait for it.` : view.race!.phase === "ready" ? "Staged. Bring the revs up." : view.race!.phase === "tree" ? "" : view.race!.phase === "racing" && me.reaction === null && !me.blown ? "GO" : me.foul && !done ? "Red light" : me.blown && !done ? "Blown" : "";
      setBanner((was) => (was === words ? was : words));
      const solid = !!gl && gl.render({ race: view.race!, cars: models, tones: TONES, width: cv.clientWidth, height: cv.clientHeight, dpr: Math.min(2, window.devicePixelRatio || 1), time: now, still: motionSetting() !== "on", seat: seatNow.current });
      setSolidShown((was) => (was === solid ? was : solid));
      if (glCanvas.current) glCanvas.current.style.visibility = solid ? "visible" : "hidden";
      draw(g, cv.clientWidth, cv.clientHeight, view, s.tick, solid, seatNow.current === "cockpit");
    };
    frame = requestAnimationFrame(loop);

    const keys = new Set<string>();
    const throttle = () => (controls.current.gas = keys.has("up") ? 100 : keys.has("half") ? 55 : 0);
    const named = (e: KeyboardEvent) => (e.key === "ArrowUp" || e.key === "w" || e.key === "W" ? "up" : e.key === "ArrowDown" || e.key === "s" || e.key === "S" ? "half" : e.key === " " || e.key === "d" || e.key === "D" || e.key === "ArrowRight" ? "shiftup" : e.key === "a" || e.key === "A" || e.key === "ArrowLeft" ? "shiftdown" : "");
    const down = (e: KeyboardEvent) => {
      if ((e.key === "c" || e.key === "C") && !e.repeat) return swapSeat();
      const k = named(e);
      if (!k) return;
      e.preventDefault();
      wakeArcadeSound();
      if (e.repeat) return;
      if (k === "shiftup") shift(1);
      else if (k === "shiftdown") shift(-1);
      else {
        keys.add(k);
        throttle();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = named(e);
      if (k === "up" || k === "half") {
        keys.delete(k);
        throttle();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      cancelAnimationFrame(frame);
      gone = true;
      gl?.dispose();
      note?.stop();
      window.removeEventListener("resize", size);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // One race for the life of this screen: the parent gives it a new key for another.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The pedal: further up it is further down. */
  const pedal = (e: React.PointerEvent<HTMLButtonElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const share = 1 - (e.clientY - box.top) / box.height;
    gas(Math.round(Math.max(35, Math.min(100, 35 + share * 80))));
  };

  const leave = () => {
    const s = state.current;
    if (!s || results) return;
    // Before the tree nothing has happened. After it, walking away is losing.
    if (s.phase === "staging" || s.phase === "ready") return onDone(null);
    const run = pinkSlipsResults(s);
    onDone({ mine: { ...run[0]!, won: false }, theirs: run[1] ?? null, forfeit: true });
  };

  const mine = results?.[0];
  const theirs = results?.[1] ?? null;
  const push = !!mine && !!theirs && !mine.won && !theirs.won;
  const headline = !mine ? "" : !rival ? (mine.breakout ? "Breakout" : mine.finished && !mine.foul ? "Timeslip" : mine.foul ? "Red light" : "Did not finish") : mine.won ? "You win" : push ? "Nobody wins" : mine.breakout ? "You broke out" : "You lose";

  return (
    <div className="pinks-strip">
      <canvas ref={glCanvas} className="gl" />
      <canvas ref={canvas} />
      <div className="pinks-strip-top">
        <button type="button" onClick={leave} disabled={!!results}>{rival && rival.stake > 0 ? "Forfeit" : "Leave"}</button>
        {solidShown && <button type="button" onClick={swapSeat} aria-label="Change the view">{seat === "chase" ? "Get in" : "Step back"}</button>}
        <span>{rules.name}{rival ? ` · ${carName} against ${rival.name}` : ` · ${carName}, test and tune`}</span>
      </div>
      {banner && !results && <div className="pinks-banner" key={banner}>{banner}</div>}
      {!results && (
        <div className="pinks-pads">
          <div className="shifter">
            <button type="button" onPointerDown={() => shift(1)} aria-label="Shift up">▲<small>{gearShown === 0 ? (spec.auto ? "Drive" : "1st") : spec.auto ? "D" : "Up"}</small></button>
            <button type="button" onPointerDown={() => shift(-1)} aria-label="Shift down">▼<small>Down</small></button>
          </div>
          <button
            type="button"
            className="pedal"
            aria-label="Throttle"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              pedal(e);
            }}
            onPointerMove={(e) => e.buttons && pedal(e)}
            onPointerUp={() => gas(0)}
            onPointerCancel={() => gas(0)}
          >
            Gas
          </button>
        </div>
      )}
      {mine && (
        <div className="pinks-slip" role="dialog" aria-label="Result">
          <h2 className={mine.won ? "won" : ""}>{headline}</h2>
          {rival && rival.stake > 0 && <p className="money">{mine.won ? `+$${rival.stake.toLocaleString("en-US")}` : push ? "Stakes back" : `-$${rival.stake.toLocaleString("en-US")}`}</p>}
          <table>
            <thead>
              <tr><th></th><th>{carName}</th>{theirs && <th>{rival!.name}</th>}</tr>
            </thead>
            <tbody>
              <tr><th>Reaction</th><td>{mine.foul ? "Red light" : slip(mine.reaction)}</td>{theirs && <td>{theirs.foul ? "Red light" : slip(theirs.reaction)}</td>}</tr>
              <tr><th>Time</th><td>{mine.blown && !mine.finished ? "Blown" : slip(mine.time)}</td>{theirs && <td>{theirs.blown && !theirs.finished ? "Blown" : slip(theirs.time)}</td>}</tr>
              <tr><th>MPH</th><td>{mine.mph}</td>{theirs && <td>{theirs.mph}</td>}</tr>
              {rules.index > 0 && <tr><th>Index {(rules.index / 100).toFixed(2)}</th><td>{mine.breakout ? "Broke out" : mine.time === null ? "—" : `+${((mine.time - rules.index * 10) / 1000).toFixed(3)}`}</td>{theirs && <td>{theirs.breakout ? "Broke out" : theirs.time === null ? "—" : `+${((theirs.time - rules.index * 10) / 1000).toFixed(3)}`}</td>}</tr>}
            </tbody>
          </table>
          {mine.blown && <p className="bad">The engine let go. It needs a rebuild before it runs again.</p>}
          <button type="button" className="yes" onClick={() => onDone({ mine, theirs, forfeit: false })}>Back to the garage</button>
        </div>
      )}
    </div>
  );
}
