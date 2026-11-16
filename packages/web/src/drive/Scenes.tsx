// The places in Road to the Shootout, drawn: the garage you stand in, the car with its hood up, the
// car up in the air, and the way out of town. Each is a picture with things in it to pick, the way
// the old garage games did it; what a pick does is the garage screen's business (`PinkSlips`).
import type { ReactNode } from "react";
import { CARS, STYLES } from "./carshapes";

const PAINTS = ["#b23a48", "#3d6b9a", "#d9a441", "#5c8a5a", "#8a8f99", "#e4dfd2", "#6b4a8a", "#c8643c", "#2f7f86"];
export const paintOf = (id: number) => PAINTS[Math.abs(id) % PAINTS.length]!;
/** What a part looks like at each step: stock iron, then blue, red and gold. */
const STEP = ["#70747e", "#3f8fd6", "#d6453f", "#e0b23a"];
const step = (level: number) => STEP[Math.max(0, Math.min(3, level))]!;

export type Box = [x: number, y: number, w: number, h: number];
/** A job with bolts in it: which thing they are on, and which are still done up. */
export interface Bolts { spot: string; left: number[] }

interface Picking {
  sel: string | null;
  pick: (spot: string) => void;
  hint: (label: string | null) => void;
  bolts?: Bolts | null;
  undo?: (bolt: number) => void;
}

/** Something in a scene that can be picked. Its name shows when it is pointed at, and always on a touch screen. */
function Spot({ id, label, at, p, children }: { id: string; label: string; at: [x: number, y: number]; p: Picking; children: ReactNode }) {
  const w = label.length * 5.6 + 12;
  return (
    <g
      className={p.sel === id ? "spot on" : "spot"} role="button" tabIndex={0} aria-label={label}
      onClick={() => p.pick(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.pick(id); } }}
      onMouseEnter={() => p.hint(label)} onMouseLeave={() => p.hint(null)} onFocus={() => p.hint(label)} onBlur={() => p.hint(null)}
    >
      {children}
      <g className="tag" transform={`translate(${Math.max(2, Math.min(638 - w, at[0] - w / 2))} ${at[1]})`}>
        <rect width={w} height={14} rx={2} />
        <text x={w / 2} y={10.5} textAnchor="middle">{label}</text>
      </g>
    </g>
  );
}

/** The bolts of the job in hand, at the corners of the thing they hold on. */
function BoltsOn({ id, box, p, round = false }: { id: string; box: Box; p: Picking; round?: boolean }) {
  if (p.bolts?.spot !== id) return null;
  const [x, y, w, h] = box;
  const all: [number, number][] = round
    ? [0, 1, 2, 3, 4].map((i) => [x + w / 2 + Math.sin((i * Math.PI * 2) / 5) * w * 0.26, y + h / 2 - Math.cos((i * Math.PI * 2) / 5) * h * 0.26])
    : [[x + 9, y + 9], [x + w - 9, y + 9], [x + w - 9, y + h - 9], [x + 9, y + h - 9]];
  return (
    <g>
      {all.map(([bx, by], i) => p.bolts!.left.includes(i) ? (
        <g key={i} className="bolt" role="button" tabIndex={0} aria-label={`Bolt ${i + 1}`} onClick={(e) => { e.stopPropagation(); p.undo?.(i); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); p.undo?.(i); } }}>
          <circle cx={bx} cy={by} r={13} className="reach" />
          <polygon points={[0, 1, 2, 3, 4, 5].map((k) => `${bx + Math.cos((k * Math.PI) / 3) * 7},${by + Math.sin((k * Math.PI) / 3) * 7}`).join(" ")} />
          <circle cx={bx} cy={by} r={2.6} className="eye" />
        </g>
      ) : <circle key={i} cx={bx} cy={by} r={3} className="hole" />)}
    </g>
  );
}

// ---- A car, side on ---------------------------------------------------------------------------------

export function carGeom(model: string, scale: number) {
  const spec = CARS[model] ?? CARS.sparrow!;
  const style = STYLES[spec.style]!;
  const k = scale * (spec.scale ?? 1);
  const metres = style.profile.reduce((m, q) => Math.max(m, q[0]), 0);
  return { spec, style, k, length: metres * k, rear: 0.78 * k, front: (metres - 0.78) * k, r: 0.31 * k, roof: style.profile.reduce((m, q) => Math.max(m, q[1]), 0) * k, sill: 0.25 * k };
}

/** The car from the side, nose to the right, its back bumper at `x` and its tyres on `ground`. */
export function CarSide({ model, tone, x, ground, scale, bent = 0, tyres = 0 }: { model: string; tone: string; x: number; ground: number; scale: number; bent?: number; tyres?: number }) {
  const g = carGeom(model, scale);
  const at = (q: readonly [number, number]) => `${(x + q[0] * g.k).toFixed(1)},${(ground - q[1] * g.k).toFixed(1)}`;
  const deck = ground - g.style.deck * g.k;
  return (
    <g className="car">
      <polygon points={g.style.profile.map(at).join(" ")} fill={tone} stroke="#0b0b10" strokeWidth={1.5} strokeLinejoin="round" />
      <rect x={x + 2} y={ground - 0.5 * g.k} width={g.length - 4} height={0.07 * g.k} fill="#0008" />
      {g.style.side.length > 0 && <polygon points={g.style.side.map(at).join(" ")} fill="#11141c" stroke="#0b0b10" strokeWidth={1} />}
      {g.style.glass.map(([a, b], i) => <line key={i} x1={at(a).split(",")[0]} y1={at(a).split(",")[1]} x2={at(b).split(",")[0]} y2={at(b).split(",")[1]} stroke="#7fa6c9" strokeWidth={Math.max(2, 0.05 * g.k)} strokeLinecap="round" />)}
      {g.spec.wing && <path d={`M${x + 0.12 * g.k} ${deck} v${-0.22 * g.k} h${0.5 * g.k} v${0.05 * g.k} h${-0.4 * g.k} v${0.17 * g.k}z`} fill={tone} stroke="#0b0b10" strokeWidth={1} />}
      <rect x={x + g.length - 0.1 * g.k} y={ground - 0.74 * g.k} width={0.09 * g.k} height={0.14 * g.k} fill="#fff1c9" />
      <rect x={x} y={ground - 0.78 * g.k} width={0.07 * g.k} height={0.16 * g.k} fill="#ff2a2a" />
      {bent > 0 && (
        <g stroke="#0b0b10" strokeWidth={1.4} fill="none" opacity={Math.min(1, 0.35 + bent / 600)}>
          <path d={`M${x + g.length * 0.72} ${ground - 0.8 * g.k} l${0.12 * g.k} ${0.1 * g.k} l${-0.1 * g.k} ${0.08 * g.k} l${0.14 * g.k} ${0.1 * g.k}`} />
          {bent >= 300 && <path d={`M${x + g.length * 0.3} ${ground - 0.7 * g.k} l${0.1 * g.k} ${0.12 * g.k} l${-0.14 * g.k} ${0.06 * g.k}`} />}
          {bent >= 600 && <path d={`M${x + g.length * 0.5} ${ground - 0.86 * g.k} l${-0.08 * g.k} ${0.16 * g.k} l${0.16 * g.k} ${0.04 * g.k}`} />}
        </g>
      )}
      {[g.rear, g.front].map((wx) => (
        <g key={wx}>
          <circle cx={x + wx} cy={ground - g.r} r={g.r * 1.16} fill="#0b0b10" />
          <circle cx={x + wx} cy={ground - g.r} r={g.r} fill="#17171c" stroke={tyres >= 3 ? "#3a3a44" : "#0b0b10"} strokeWidth={tyres >= 3 ? g.r * 0.14 : 1} />
          <circle cx={x + wx} cy={ground - g.r} r={g.r * 0.58} fill={tyres > 0 ? step(tyres) : "#b9bec9"} stroke="#0b0b10" strokeWidth={1} />
          <circle cx={x + wx} cy={ground - g.r} r={g.r * 0.16} fill="#22242b" />
        </g>
      ))}
    </g>
  );
}

function Wall({ floor = 232 }: { floor?: number }) {
  return (
    <>
      <defs>
        <pattern id="sr-brick" width="32" height="16" patternUnits="userSpaceOnUse"><path d="M0 0h32M0 8h32M0 16h32M8 0v8M24 8v8" stroke="#0003" strokeWidth="1" fill="none" /></pattern>
        <pattern id="sr-peg" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="1" fill="#0005" /></pattern>
      </defs>
      <rect width="640" height={floor} fill="#2d2a3a" />
      <rect width="640" height={floor} fill="url(#sr-brick)" />
      <rect y={floor} width="640" height={360 - floor} fill="#4a4852" />
      <rect y={floor} width="640" height="4" fill="#1a1820" />
      {[-260, -120, 0, 120, 260].map((dx) => <line key={dx} x1={320 + dx * 0.72} y1={floor + 4} x2={320 + dx * 1.5} y2={360} stroke="#0002" strokeWidth="1.5" />)}
    </>
  );
}

// ---- The garage -------------------------------------------------------------------------------------

export interface GarageLook {
  car: { model: string; tone: string; bent: number; tyres: number } | null;
  tools: { jack: boolean; wrenches: boolean; hammer: boolean };
  shelf: number;
  date: [month: string, day: number];
  house: boolean;
}

export function GarageScene({ look, p }: { look: GarageLook; p: Picking }) {
  const g = look.car ? carGeom(look.car.model, 62) : null;
  const x = g ? 330 - g.length / 2 : 0;
  const ground = 326;
  return (
    <svg className="sr-art" viewBox="0 0 640 360" role="group" aria-label="Your garage">
      <Wall />
      <rect x="200" y="6" width="240" height="6" fill="#f6f2d8" />
      <polygon points="200,12 440,12 560,232 80,232" fill="#f6f2d8" opacity="0.045" />

      <Spot id="door" label="Out the door" at={[517, 22]} p={p}>
        <rect x="410" y="40" width="214" height="192" fill="#191720" />
        <rect x="416" y="46" width="202" height="186" fill="#8d8f96" />
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x="416" y={46 + i * 37.2} width="202" height="2" fill="#5d6068" />)}
        {[0, 1, 2, 3].map((i) => <rect key={i} x={426 + i * 48} y="92" width="38" height="24" fill="#16203a" stroke="#5d6068" strokeWidth="2" />)}
        <circle cx="452" cy="100" r="1" fill="#fff" /><circle cx="548" cy="108" r="1" fill="#fff" /><circle cx="594" cy="98" r="1" fill="#fff" />
        <rect x="506" y="212" width="22" height="5" fill="#33353c" />
      </Spot>

      <Spot id="tools" label="The tool wall" at={[99, 52]} p={p}>
        <rect x="24" y="70" width="150" height="92" fill="#7a6549" stroke="#191720" strokeWidth="2" />
        <rect x="24" y="70" width="150" height="92" fill="url(#sr-peg)" />
        {[0, 1, 2].map((i) => look.tools.wrenches
          ? <path key={i} d={`M${46 + i * 18} 84 l5 0 l1 6 l-2 3 l0 44 l-4 0 l0 -44 l-2 -3z`} fill="#cfd3dc" stroke="#191720" strokeWidth="1" />
          : <path key={i} d={`M${46 + i * 18} 84 l5 0 l1 6 l-2 3 l0 44 l-4 0 l0 -44 l-2 -3z`} className="missing" />)}
        {look.tools.hammer
          ? <g><rect x="130" y="96" width="6" height="52" fill="#b98a4e" stroke="#191720" strokeWidth="1" /><rect x="118" y="84" width="30" height="14" fill="#565a64" stroke="#191720" strokeWidth="1" /></g>
          : <path d="M118 84h30v14h-12v50h-6v-50h-12z" className="missing" />}
        {look.tools.jack
          ? <g><path d="M22 300 l66 0 l6 12 l-78 0z" fill="#c8322c" stroke="#191720" strokeWidth="1.5" /><rect x="62" y="270" width="5" height="32" fill="#565a64" transform="rotate(28 64 300)" /><circle cx="30" cy="313" r="5" fill="#17171c" /><circle cx="84" cy="313" r="5" fill="#17171c" /><circle cx="44" cy="296" r="7" fill="#8d8f96" stroke="#191720" /></g>
          : <path d="M22 300 l66 0 l6 12 l-78 0z" className="missing" />}
      </Spot>

      <rect x="14" y="196" width="186" height="10" fill="#9a7748" stroke="#191720" strokeWidth="1.5" />
      <rect x="22" y="206" width="170" height="30" fill="#5b4630" stroke="#191720" strokeWidth="1.5" />
      <rect x="22" y="236" width="8" height="26" fill="#3b2d20" /><rect x="184" y="236" width="8" height="26" fill="#3b2d20" />
      <rect x="92" y="213" width="30" height="5" fill="#2a2018" />
      <Spot id="paper" label="The paper" at={[62, 166]} p={p}>
        <polygon points="30,196 38,180 96,180 92,196" fill="#e9e3d0" stroke="#191720" strokeWidth="1.2" />
        <rect x="42" y="183" width="30" height="3" fill="#222" /><path d="M40 189h46M39 192h46" stroke="#777" strokeWidth="1" />
      </Spot>
      <Spot id="laptop" label="The laptop" at={[130, 142]} p={p}>
        <rect x="108" y="158" width="48" height="32" rx="2" fill="#22242b" stroke="#191720" strokeWidth="1.2" />
        <rect x="112" y="162" width="40" height="24" fill="#4cc9ff" /><path d="M115 167h22M115 172h30M115 177h16" stroke="#0b3a52" strokeWidth="2" />
        <polygon points="104,196 108,190 156,190 160,196" fill="#3a3d47" stroke="#191720" strokeWidth="1.2" />
      </Spot>
      <Spot id="manual" label="The manual" at={[180, 166]} p={p}>
        <rect x="166" y="184" width="28" height="12" fill="#b3261e" stroke="#191720" strokeWidth="1.2" /><rect x="170" y="187" width="16" height="2" fill="#f1e6c8" />
      </Spot>

      <Spot id="shelf" label={look.shelf ? `Your shelf (${look.shelf})` : "Your shelf"} at={[269, 42]} p={p}>
        <rect x="214" y="60" width="110" height="124" fill="#211f2a" stroke="#191720" strokeWidth="2" />
        {[0, 1, 2].map((r) => <rect key={r} x="214" y={98 + r * 40} width="110" height="5" fill="#8d8f96" />)}
        {Array.from({ length: Math.min(9, look.shelf) }, (_, i) => <rect key={i} x={220 + (i % 3) * 34} y={76 + Math.floor(i / 3) * 40} width={26} height={22} fill={["#b98a4e", "#a67c52", "#c29a62"][i % 3]} stroke="#191720" strokeWidth="1" />)}
      </Spot>

      <rect x="344" y="62" width="44" height="54" fill="#f1ece0" stroke="#191720" strokeWidth="1.5" />
      <rect x="344" y="62" width="44" height="14" fill="#b3261e" />
      <text x="366" y="73" textAnchor="middle" className="cal-m">{look.date[0]}</text>
      <text x="366" y="106" textAnchor="middle" className="cal-d">{look.date[1]}</text>

      <Spot id="board" label={look.house ? "The house board" : "The notice board"} at={[366, 180]} p={p}>
        <rect x="340" y="126" width="52" height="46" fill="#a67c52" stroke="#5b4630" strokeWidth="3" />
        <rect x="346" y="132" width="16" height="14" fill="#f1ece0" /><rect x="368" y="134" width="18" height="12" fill="#ffe27a" /><rect x="350" y="152" width="22" height="13" fill="#bfe0ff" />
        <circle cx="354" cy="133" r="1.6" fill="#b3261e" /><circle cx="377" cy="135" r="1.6" fill="#2f7f86" /><circle cx="361" cy="153" r="1.6" fill="#b3261e" />
      </Spot>

      <ellipse cx="330" cy="332" rx="150" ry="9" fill="#0005" />
      {look.car && g ? (
        <>
          <CarSide model={look.car.model} tone={look.car.tone} x={x} ground={ground} scale={62} bent={look.car.bent} tyres={look.car.tyres} />
          <Spot id="body" label="The body" at={[x + g.length * 0.38, ground - g.roof - 20]} p={p}>
            <rect x={x} y={ground - g.roof} width={g.length * 0.66} height={g.roof - g.sill - 6} className="reach" />
          </Spot>
          <Spot id="hood" label="Pop the hood" at={[x + g.length * 0.86, ground - g.roof * 0.74 - 20]} p={p}>
            <rect x={x + g.length * 0.66} y={ground - g.roof * 0.74} width={g.length * 0.34} height={g.roof * 0.74 - g.sill - 6} className="reach" />
          </Spot>
          <Spot id="under" label="Jack it up" at={[x + g.length / 2, ground + 6]} p={p}>
            <circle cx={x + g.rear} cy={ground - g.r} r={g.r * 1.2} className="reach" />
            <circle cx={x + g.front} cy={ground - g.r} r={g.r * 1.2} className="reach" />
            <rect x={x + g.rear} y={ground - g.sill - 6} width={g.front - g.rear} height={g.sill + 6} className="reach" />
          </Spot>
        </>
      ) : (
        <>
          <ellipse cx="330" cy="318" rx="46" ry="7" fill="#17151c" opacity="0.7" />
          <text x="330" y="296" textAnchor="middle" className="chalk">EMPTY BAY</text>
        </>
      )}
    </svg>
  );
}

// ---- Under the hood ---------------------------------------------------------------------------------

export interface BayLook { tone: string; intake: number; cam: number; boost: number; turbo: boolean; engine: number; oil: number; plugs: number; mixture: string }

const BAY: Record<string, Box> = { intake: [92, 108, 124, 96], cam: [246, 104, 148, 52], boost: [436, 96, 110, 96], block: [228, 96, 184, 168], fuel: [150, 212, 72, 56], plugs: [246, 164, 148, 34], oil: [330, 210, 80, 48] };

export function EngineBay({ look, p }: { look: BayLook; p: Picking }) {
  const tired = look.engine <= 0;
  return (
    <svg className="sr-art" viewBox="0 0 640 360" role="group" aria-label="Under the hood">
      <rect width="640" height="360" fill="#131118" />
      <rect x="0" y="0" width="56" height="360" fill={look.tone} /><rect x="584" y="0" width="56" height="360" fill={look.tone} />
      <rect x="56" y="0" width="6" height="360" fill="#0008" /><rect x="578" y="0" width="6" height="360" fill="#0008" />
      <rect x="62" y="14" width="516" height="332" rx="18" fill="#1f1d27" stroke="#0b0b10" strokeWidth="2" />
      <rect x="170" y="22" width="300" height="26" fill="#3a3d47" stroke="#0b0b10" strokeWidth="1.5" />
      {Array.from({ length: 29 }, (_, i) => <line key={i} x1={176 + i * 10.2} y1="24" x2={176 + i * 10.2} y2="46" stroke="#0b0b10" strokeWidth="1" />)}
      <rect x="78" y="312" width="484" height="26" fill="#2a2833" stroke="#0b0b10" strokeWidth="1.5" />
      <rect x="92" y="246" width="74" height="46" fill="#22242b" stroke="#0b0b10" strokeWidth="1.5" /><rect x="100" y="240" width="12" height="8" fill="#b3261e" /><rect x="146" y="240" width="12" height="8" fill="#33353c" />
      <path d="M470 250 q40 -6 60 18 q-10 34 -52 26z" fill="#d8e6ef" opacity="0.55" stroke="#0b0b10" strokeWidth="1.5" />

      <Spot id="block" label={tired ? "The engine (blown)" : "The engine"} at={[320, 268]} p={p}>
        <rect x="228" y="96" width="184" height="168" rx="6" fill={tired ? "#3a3237" : "#5a5d66"} stroke="#0b0b10" strokeWidth="2" />
        <rect x="236" y="200" width="88" height="56" fill="#0002" />
        {tired && <path d="M300 204 l14 20 l-10 4 l16 24" stroke="#0b0b10" strokeWidth="3" fill="none" />}
      </Spot>
      <Spot id="cam" label="Cam cover" at={[320, 84]} p={p}>
        <rect x="246" y="104" width="148" height="52" rx="10" fill={step(look.cam)} stroke="#0b0b10" strokeWidth="2" />
        <path d="M262 118h116M262 130h116M262 142h116" stroke="#0003" strokeWidth="3" />
        <BoltsOn id="cam" box={BAY.cam!} p={p} />
      </Spot>
      <Spot id="plugs" label="Plugs" at={[320, 200]} p={p}>
        <rect x="246" y="164" width="148" height="34" className="reach" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <path d={`M${270 + i * 34} 180 q${40 - i * 12} ${26 + i * 4} ${170 - i * 34} 14`} stroke={look.plugs < 350 ? "#5b4630" : "#c8322c"} strokeWidth="3" fill="none" />
            <circle cx={270 + i * 34} cy="180" r="7" fill={look.plugs < 350 ? "#3b2d20" : "#e4dfd2"} stroke="#0b0b10" strokeWidth="1.5" />
          </g>
        ))}
        <circle cx="440" cy="206" r="14" fill="#22242b" stroke="#0b0b10" strokeWidth="1.5" />
      </Spot>
      <Spot id="oil" label="Oil" at={[366, 262]} p={p}>
        <circle cx="352" cy="232" r="15" fill="#22242b" stroke="#0b0b10" strokeWidth="2" /><path d="M343 232h18M352 223v18" stroke="#70747e" strokeWidth="3" />
        <path d="M392 248 v-22 a7 7 0 1 1 1 0" stroke={look.oil < 350 ? "#5b4630" : "#e0b23a"} strokeWidth="4" fill="none" />
      </Spot>
      <Spot id="intake" label="Intake" at={[154, 88]} p={p}>
        {[0, 1, 2, 3].map((i) => <path key={i} d={`M228 ${118 + i * 20} C200 ${118 + i * 20} 196 156 172 156`} stroke={step(look.intake)} strokeWidth="9" fill="none" strokeLinecap="round" />)}
        <circle cx="136" cy="156" r="40" fill={look.intake > 0 ? step(look.intake) : "#22242b"} stroke="#0b0b10" strokeWidth="2" />
        <circle cx="136" cy="156" r="24" fill="none" stroke="#0005" strokeWidth="8" strokeDasharray="3 3" />
        <BoltsOn id="intake" box={BAY.intake!} p={p} />
      </Spot>
      <Spot id="fuel" label={`Mixture (${look.mixture})`} at={[186, 274]} p={p}>
        <rect x="156" y="216" width="60" height="44" rx="5" fill="#8d8f96" stroke="#0b0b10" strokeWidth="2" />
        <path d="M216 230 h16 v-36" stroke="#b98a4e" strokeWidth="5" fill="none" />
        <circle cx="186" cy="238" r="11" fill="#e0b23a" stroke="#0b0b10" strokeWidth="1.5" /><path d="M178 238h16" stroke="#0b0b10" strokeWidth="3" />
      </Spot>
      <Spot id="boost" label={look.turbo ? "Turbo" : "No turbo"} at={[492, 76]} p={p}>
        {look.turbo ? (
          <>
            <path d="M412 132 h36" stroke="#565a64" strokeWidth="14" />
            <circle cx="486" cy="140" r="38" fill={step(look.boost)} stroke="#0b0b10" strokeWidth="2" />
            <path d="M486 140 m-22 0 a22 22 0 1 1 22 22" stroke="#0005" strokeWidth="7" fill="none" /><circle cx="486" cy="140" r="8" fill="#22242b" />
            <path d="M514 166 q30 10 30 40" stroke={step(look.boost)} strokeWidth="12" fill="none" />
          </>
        ) : <rect x="440" y="100" width="100" height="84" rx="8" className="missing" />}
        <BoltsOn id="boost" box={BAY.boost!} p={p} />
      </Spot>
    </svg>
  );
}

// ---- The car in the air, and the car from the side --------------------------------------------------

export interface SideLook { model: string; tone: string; bent: number; tyres: number; exhaust: number; trans: number; weight: number; jack: boolean; rear: boolean; forSale: boolean }

export function SideView({ look, lifted, p }: { look: SideLook; lifted: boolean; p: Picking }) {
  const scale = 100;
  const g = carGeom(look.model, scale);
  const x = 320 - g.length / 2;
  const floor = 306;
  const ground = lifted ? floor - 54 : floor;
  const axle = ground - g.r;
  const belly = ground - g.sill + 2;
  const drive = look.rear ? x + g.rear : x + g.front;
  const box: Box = [x + g.length * 0.5, belly, g.length * 0.2, 34];
  const pipe: Box = [x + g.rear * 0.4, belly + 2, g.length * 0.3, 26];
  const idle = look.rear ? x + g.front : x + g.rear;
  const wheel: Box = [idle - g.r, axle - g.r, g.r * 2, g.r * 2];
  const glass: Box = [x + g.length * 0.3, ground - g.roof + 4, g.length * 0.34, g.roof * 0.36];
  return (
    <svg className="sr-art" viewBox="0 0 640 360" role="group" aria-label={lifted ? "The car, up in the air" : "The car, from the side"}>
      <Wall floor={260} />
      <ellipse cx="320" cy={floor + 6} rx={g.length * 0.5} ry="9" fill="#0005" />
      {lifted && [x + g.rear + g.r * 1.9, x + g.front - g.r * 1.9].map((sx) => look.jack
        ? <g key={sx}><polygon points={`${sx - 16},${floor} ${sx + 16},${floor} ${sx + 5},${belly} ${sx - 5},${belly}`} fill="#c8322c" stroke="#0b0b10" strokeWidth="1.5" /><rect x={sx - 9} y={belly - 3} width="18" height="5" fill="#565a64" /></g>
        : <g key={sx}>{[0, 1, 2].map((i) => <rect key={i} x={sx - 20} y={floor - 18 - i * 18} width="40" height="18" fill="#8d8f96" stroke="#0b0b10" strokeWidth="1.5" />)}</g>)}
      {lifted && (
        <>
          <Spot id="exhaust" label="Exhaust" at={[pipe[0] + pipe[2] / 2, belly + 36]} p={p}>
            <path d={`M${x + g.length * 0.74} ${belly + 12} H${x + 6}`} stroke={step(look.exhaust)} strokeWidth={5 + look.exhaust * 2} strokeLinecap="round" />
            <rect x={pipe[0] + 14} y={belly + 3} width={pipe[2] * 0.5} height="18" rx="8" fill={step(look.exhaust)} stroke="#0b0b10" strokeWidth="1.5" />
            <rect x={pipe[0]} y={pipe[1]} width={pipe[2]} height={pipe[3]} className="reach" />
            <BoltsOn id="exhaust" box={pipe} p={p} />
          </Spot>
          <Spot id="trans" label="Gearbox" at={[box[0] + box[2] / 2, belly + 44]} p={p}>
            <path d={`M${box[0]} ${belly} h${box[2]} l-8 30 h${-box[2] + 22}z`} fill={step(look.trans)} stroke="#0b0b10" strokeWidth="1.5" />
            <BoltsOn id="trans" box={box} p={p} />
          </Spot>
        </>
      )}
      <CarSide model={look.model} tone={look.tone} x={x} ground={ground} scale={scale} bent={look.bent} tyres={look.tyres} />
      {lifted ? (
        <>
          <Spot id="final" label="Final drive" at={[drive, axle + g.r + 12]} p={p}>
            <circle cx={drive} cy={axle} r={g.r * 0.5} className="reach" />
            <circle cx={drive} cy={axle} r={g.r * 0.24} fill="#e0b23a" stroke="#0b0b10" strokeWidth="1.5" />
          </Spot>
          <Spot id="tyres" label="Tyres" at={[idle, axle - g.r - 22]} p={p}>
            <circle cx={idle} cy={axle} r={g.r} className="reach" />
            <BoltsOn id="tyres" box={wheel} p={p} round />
          </Spot>
        </>
      ) : (
        <>
          <Spot id="panels" label="Bodywork" at={[x + g.length * 0.82, ground - g.roof * 0.7 - 20]} p={p}>
            <rect x={x + g.length * 0.66} y={ground - g.roof * 0.7} width={g.length * 0.34} height={g.roof * 0.7 - g.sill} className="reach" />
          </Spot>
          <Spot id="weight" label="Inside" at={[glass[0] + glass[2] / 2, glass[1] - 20]} p={p}>
            <rect x={glass[0]} y={glass[1]} width={glass[2]} height={glass[3]} className="reach" />
            <BoltsOn id="weight" box={glass} p={p} />
          </Spot>
          <Spot id="plate" label="The name on it" at={[x + 30, ground - g.sill - 60]} p={p}>
            <rect x={x - 4} y={ground - g.sill - 34} width="34" height="16" fill="#f1ece0" stroke="#0b0b10" strokeWidth="1.5" />
            <path d={`M${x + 2} ${ground - g.sill - 26}h22`} stroke="#22242b" strokeWidth="3" />
          </Spot>
          <Spot id="sell" label="Get rid of it" at={[x + g.length * 0.36 + 31, ground - g.sill - 16]} p={p}>
            <rect x={x + g.length * 0.36} y={ground - g.sill - 44} width="62" height="24" fill="#ffe27a" stroke="#0b0b10" strokeWidth="1.5" />
            <text x={x + g.length * 0.36 + 31} y={ground - g.sill - 28} textAnchor="middle" className="sign">{look.forSale ? "FOR SALE" : "$ ?"}</text>
          </Spot>
        </>
      )}
    </svg>
  );
}

// ---- Out the door -----------------------------------------------------------------------------------

function Night() {
  return (
    <>
      <rect width="640" height="360" fill="#0d1022" />
      {[[40, 30], [120, 70], [210, 24], [300, 58], [390, 34], [470, 80], [560, 28], [610, 66], [170, 110], [520, 120]].map(([sx, sy]) => <rect key={`${sx}`} x={sx} y={sy} width="2" height="2" fill="#fff" opacity="0.8" />)}
      <polygon points="0,214 90,150 170,196 260,128 360,200 450,140 540,190 640,150 640,236 0,236" fill="#171a33" />
      <rect y="236" width="640" height="124" fill="#22232b" />
    </>
  );
}

/** The junction at the end of the street: three ways to go. */
export function Junction({ p, car }: { p: Picking; car: { model: string; tone: string; bent: number; tyres: number } }) {
  const board = (id: string, label: string, y: number, text: string, sub: string, right: boolean) => (
    <Spot id={id} label={label} at={[right ? 430 : 210, y - 18]} p={p}>
      <polygon points={right ? `330,${y} 500,${y} 524,${y + 21} 500,${y + 42} 330,${y + 42}` : `310,${y} 140,${y} 116,${y + 21} 140,${y + 42} 310,${y + 42}`} fill="#1f6b3a" stroke="#f1ece0" strokeWidth="2.5" />
      <text x={right ? 420 : 220} y={y + 19} textAnchor="middle" className="road">{text}</text>
      <text x={right ? 420 : 220} y={y + 34} textAnchor="middle" className="road sub">{sub}</text>
    </Spot>
  );
  return (
    <svg className="sr-art" viewBox="0 0 640 360" role="group" aria-label="The end of the street">
      <Night />
      <polygon points="250,360 390,360 336,236 304,236" fill="#17181d" />
      <path d="M320 240v120" stroke="#e0b23a" strokeWidth="3" strokeDasharray="14 12" />
      <rect x="316" y="40" width="8" height="200" fill="#8d8f96" stroke="#0b0b10" strokeWidth="1.5" />
      {board("strip", "The strip", 52, "DRAG STRIP", "test and tune · grudge night", true)}
      {board("mountain", "The mountain road", 106, "MOUNTAIN ROAD", "bends · traffic · the law", false)}
      {board("tuner", "Morgantown", 160, "MORGANTOWN", "the dyno · 41 miles", true)}
      <g transform="translate(470 0)"><CarSide model={car.model} tone={car.tone} x={0} ground={346} scale={30} bent={car.bent} tyres={car.tyres} /></g>
    </svg>
  );
}

/** The lot by the strip: you, and whoever has pulled up alongside. */
export function Lot({ mine, theirs, name }: { mine: { model: string; tone: string; bent: number; tyres: number }; theirs: { model: string; tone: string } | null; name: string | null }) {
  const a = carGeom(mine.model, 52);
  const b = theirs ? carGeom(theirs.model, 52) : null;
  return (
    <svg className="sr-art" viewBox="0 0 640 360" role="img" aria-label={name ? `${name} has pulled up alongside` : "The lot by the strip"}>
      <Night />
      <rect x="40" y="96" width="8" height="150" fill="#565a64" /><rect x="20" y="88" width="48" height="10" fill="#f6f2d8" /><polygon points="20,98 68,98 190,330 -60,330" fill="#f6f2d8" opacity="0.06" />
      <rect x="540" y="60" width="10" height="180" fill="#565a64" /><rect x="528" y="70" width="34" height="70" rx="4" fill="#17181d" stroke="#0b0b10" />
      {[0, 1, 2].map((i) => <circle key={i} cx="545" cy={84 + i * 21} r="7" fill={i === 2 ? "#55d68a" : "#e0b23a"} opacity={i === 2 ? 0.35 : 0.9} />)}
      <path d="M0 300h640" stroke="#f1ece0" strokeWidth="2" strokeDasharray="22 16" opacity="0.5" />
      <ellipse cx={170} cy="296" rx={a.length * 0.5} ry="6" fill="#0006" />
      <CarSide model={mine.model} tone={mine.tone} x={170 - a.length / 2} ground={292} scale={52} bent={mine.bent} tyres={mine.tyres} />
      {theirs && b && (
        <g key={`${theirs.model}${name}`} className="pulls-up">
          <ellipse cx={450} cy="340" rx={b.length * 0.5} ry="6" fill="#0006" />
          <g transform="translate(900 0) scale(-1 1)"><CarSide model={theirs.model} tone={theirs.tone} x={450 - b.length / 2} ground={336} scale={52} /></g>
        </g>
      )}
    </svg>
  );
}
