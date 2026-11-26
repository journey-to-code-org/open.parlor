// Peekaboo's sparkles: a canvas over the board that answers every touch at once (a ring and a
// burst of stars where the finger landed, a trail behind a finger that drags) and throws confetti
// for a find. It draws only while something is moving, and takes no touches itself.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface Fx {
  /** A touch: a ring and a few stars. Positions are fractions of the board. */
  ripple(x: number, y: number): void;
  /** A finger dragging: a star or two behind it. */
  trail(x: number, y: number): void;
  /** A burst of stars where a picture appeared. */
  burst(x: number, y: number): void;
  /** Confetti from a point (the middle by default), for a find or a surprise. */
  confetti(x?: number, y?: number): void;
}

interface Bit {
  kind: "ring" | "star" | "dot" | "paper";
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  turn: number;
  spin: number;
  pull: number;
}

const COLORS = ["#ff5d8f", "#ffb703", "#3ec1d3", "#7b6cf6", "#5fd068", "#ff8c42", "#f15bb5"];
const pick = () => COLORS[Math.floor(Math.random() * COLORS.length)]!;
const MAX_BITS = 260;

function star(g: CanvasRenderingContext2D, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const d = i % 2 ? r * 0.45 : r;
    g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  g.closePath();
  g.fill();
}

export const FxLayer = forwardRef<Fx>(function FxLayer(_, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bits = useRef<Bit[]>([]);
  const frame = useRef(0);
  const lastTrail = useRef(0);
  const calm = useRef(false);

  useEffect(() => {
    calm.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = canvas.current!;
    const fit = () => {
      const scale = Math.min(2, devicePixelRatio || 1);
      el.width = Math.round(el.clientWidth * scale);
      el.height = Math.round(el.clientHeight * scale);
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => {
      watch.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);

  const draw = (before: number) => (now: number) => {
    const el = canvas.current;
    if (!el) return;
    const g = el.getContext("2d")!;
    const dt = Math.min(0.05, (now - before) / 1000);
    const unit = Math.min(el.width, el.height) / 100;
    g.clearRect(0, 0, el.width, el.height);
    bits.current = bits.current.filter((b) => (b.age += dt) < b.life);
    for (const b of bits.current) {
      b.vy += b.pull * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.turn += b.spin * dt;
      const t = b.age / b.life;
      g.save();
      g.translate(b.x * el.width, b.y * el.height);
      g.globalAlpha = Math.max(0, 1 - t * t);
      g.fillStyle = g.strokeStyle = b.color;
      if (b.kind === "ring") {
        g.lineWidth = unit * 1.2 * (1 - t);
        g.beginPath();
        g.arc(0, 0, unit * (3 + b.size * t), 0, Math.PI * 2);
        g.stroke();
      } else if (b.kind === "paper") {
        g.rotate(b.turn);
        // A flat piece of paper turning over as it falls.
        g.scale(1, Math.cos(b.turn * 2.3));
        g.fillRect((-unit * b.size) / 2, (-unit * b.size) / 4, unit * b.size, (unit * b.size) / 2);
      } else if (b.kind === "star") {
        g.rotate(b.turn);
        star(g, unit * b.size * (1 - t * 0.5));
      } else {
        g.beginPath();
        g.arc(0, 0, unit * b.size * (1 - t), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    frame.current = bits.current.length ? requestAnimationFrame(draw(now)) : 0;
  };
  const add = (more: Bit[]) => {
    bits.current = [...bits.current, ...more].slice(-MAX_BITS);
    if (!frame.current) frame.current = requestAnimationFrame(draw(performance.now()));
  };
  /** `n` bits flying out from a point. Speeds are in boards a second, evened out for the board's shape. */
  const fly = (kind: Bit["kind"], n: number, x: number, y: number, speed: number, size: number, life: number, pull: number, up = 0): Bit[] => {
    const el = canvas.current;
    const wide = el && el.height ? el.width / el.height : 1;
    return Array.from({ length: n }, () => {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      return { kind, x, y, vx: (Math.cos(a) * v) / Math.max(1, wide), vy: Math.sin(a) * v * Math.min(1, wide) - up, age: 0, life: life * (0.7 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), color: pick(), turn: Math.random() * 6, spin: (Math.random() - 0.5) * 10, pull };
    });
  };

  useImperativeHandle(ref, () => ({
    ripple(x, y) {
      const ring: Bit = { kind: "ring", x, y, vx: 0, vy: 0, age: 0, life: 0.55, size: 14, color: pick(), turn: 0, spin: 0, pull: 0 };
      add([ring, ...(calm.current ? [] : fly("star", 5, x, y, 0.35, 2.2, 0.6, 0.5))]);
    },
    trail(x, y) {
      const now = performance.now();
      if (calm.current || now - lastTrail.current < 28) return;
      lastTrail.current = now;
      add([...fly("star", 1, x, y, 0.08, 2.4, 0.7, 0.25), ...fly("dot", 1, x, y, 0.12, 1.2, 0.5, 0.2)]);
    },
    burst(x, y) {
      add(fly("star", calm.current ? 4 : 12, x, y, 0.55, 2.6, 0.8, 0.7));
    },
    confetti(x = 0.5, y = 0.55) {
      if (calm.current) return add(fly("star", 8, x, y, 0.4, 3, 0.9, 0.4));
      add([...fly("paper", 70, x, y, 0.9, 3.4, 2.1, 1.5, 0.5), ...fly("star", 16, x, y, 0.7, 3, 1.2, 0.9, 0.3)]);
    },
  }));

  return <canvas ref={canvas} className="pk-fx" aria-hidden="true" />;
});
