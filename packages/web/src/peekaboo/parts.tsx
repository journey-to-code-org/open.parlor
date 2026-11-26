// Peekaboo's small pieces: a video, a picture (an emoji, a photo, or a drawn shape or colour), the
// grown-ups' held button and the choice of what to play.
import { useEffect, useRef, useState } from "react";
import type { Mode, Thing } from "./things";

const HOLD_MS = 1500;

export const MODES: { id: Mode; name: string; emoji: string; what: string }[] = [
  { id: "tap", name: "Tap", emoji: "👆", what: "Tap anywhere: a picture pops up and is named." },
  { id: "peek", name: "Peekaboo", emoji: "🙈", what: "Something is under the blanket: tap to find it." },
  { id: "find", name: "Where's…?", emoji: "🔎", what: "Two pictures: tap the one asked for." },
  { id: "sing", name: "Sing", emoji: "🎵", what: "Old MacDonald, a verse for each animal: tap for the next. Sing along with the words." },
  { id: "dance", name: "Dance", emoji: "💃", what: "The theme song, Little Feet Go Stomp: tap to start it. His pictures dance, and every tap throws stars." },
  { id: "story", name: "Story", emoji: "📖", what: "A little book of his pictures: tap the right side for the next page, the left to go back." },
];

/** A video element showing a stream. */
export function Video({ stream, muted, mirror, className, label, onVideo }: { stream: MediaStream | null; muted?: boolean; mirror?: boolean; className?: string; label: string; /** The element, for taking a photo from it. */ onVideo?: (v: HTMLVideoElement | null) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream]);
  useEffect(() => {
    onVideo?.(ref.current);
    return () => onVideo?.(null);
  }, [onVideo]);
  return <video ref={ref} className={`${className ?? ""}${mirror ? " pk-mirror" : ""}`} autoPlay playsInline muted={muted} aria-label={label} />;
}

/** Points around the middle of a 100-unit square, `n` of them, alternating between two radii. */
const around = (n: number, outer: number, inner: number, turn = -90) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = ((turn + (i * 180) / n) * Math.PI) / 180;
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as const;
  });
const STAR = around(5, 47, 20).map((p) => p.join(",")).join(" ");
/** A splash of paint: a blob with soft bumps, drawn through the midpoints between points. */
const SPLASH = (() => {
  const pts = around(7, 46, 36, -70);
  const mid = (i: number) => {
    const [a, b] = [pts[i % pts.length]!, pts[(i + 1) % pts.length]!];
    return `${(a[0] + b[0]) / 2},${(a[1] + b[1]) / 2}`;
  };
  return `M${mid(0)} ` + pts.map((_, i) => `Q${pts[(i + 1) % pts.length]!.join(",")} ${mid(i + 1)}`).join(" ") + "Z";
})();

/** A shape in its colour, or a splash of a colour, drawn so it is the same everywhere. */
export function Drawn({ draw }: { draw: NonNullable<Thing["draw"]> }) {
  const paint = { fill: draw.fill, stroke: draw.fill === "#ffffff" ? "#cfc8e8" : "rgba(0,0,0,0.12)", strokeWidth: 2.5, strokeLinejoin: "round" as const };
  const shape = {
    circle: <circle cx="50" cy="50" r="44" {...paint} />,
    square: <rect x="8" y="8" width="84" height="84" rx="5" {...paint} />,
    triangle: <polygon points="50,6 95,90 5,90" {...paint} />,
    star: <polygon points={STAR} {...paint} />,
    heart: <path d="M50 88 C18 66 4 48 6 30 C8 13 30 6 50 24 C70 6 92 13 94 30 C96 48 82 66 50 88Z" {...paint} />,
    diamond: <polygon points="50,4 92,50 50,96 8,50" {...paint} />,
    oval: <ellipse cx="50" cy="50" rx="30" ry="45" {...paint} />,
    rectangle: <rect x="4" y="24" width="92" height="52" rx="4" {...paint} />,
    splash: <path d={SPLASH} {...paint} />,
  }[draw.shape];
  return (
    <svg className="pk-drawn" viewBox="0 0 100 100" aria-hidden="true">
      {shape}
    </svg>
  );
}

export function Picture({ thing, className }: { thing: Thing; className?: string }) {
  return (
    <div className={`pk-picture ${className ?? ""}`}>
      {thing.photo ? <img src={thing.photo} alt="" draggable={false} /> : thing.draw ? <Drawn draw={thing.draw} /> : <span className="pk-emoji" aria-hidden="true">{thing.emoji}</span>}
      <span className="pk-word">{thing.word}</span>
    </div>
  );
}

/** The grown-ups' way in: held for a moment and a half. A baby's slap does nothing. */
export function HoldButton({ onOpen }: { onOpen: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    if (timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onOpen();
    }, HOLD_MS);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  return (
    <button
      type="button"
      className={`pk-hold${holding ? " pk-holding" : ""}`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !e.repeat && start(e)}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Grown-ups: press and hold for the settings"
    >
      <span aria-hidden="true">🔒</span>
      <small>Hold</small>
    </button>
  );
}

export function ModePicker({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <div className="pk-modes" role="radiogroup" aria-label="What to play">
      {MODES.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? "pk-on" : ""} onClick={() => onMode(m.id)} title={m.what}>
          <span aria-hidden="true">{m.emoji}</span> {m.name}
        </button>
      ))}
    </div>
  );
}

