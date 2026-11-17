// Draw & Guess on your own: a sketchbook. Computer players can't draw, so there's no practice
// table; this is the canvas and the pens of the real game with one of its words to draw, nothing
// scored. Undo, start again, a new word, and keep the picture (downloaded as a PNG).
import { DRAW_PROMPTS, type WordStroke } from "@journey-to-code/games";
import { useMemo, useRef, useState } from "react";
import { Canvas } from "./WordPieces";

const pick = (not?: string) => {
  const from = DRAW_PROMPTS.filter((w) => w !== not);
  return from[Math.floor(Math.random() * from.length)]!;
};

export function Sketchbook({ onLeave }: { onLeave: () => void }) {
  const [word, setWord] = useState(() => pick());
  const [strokes, setStrokes] = useState<WordStroke[]>([]);
  const [drawn, setDrawn] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useMemo(() => ({ strokes, draw: { type: "stroke", prompt: word } }), [strokes, word]);

  const fresh = () => {
    setStrokes([]);
    setWord((w) => pick(w));
  };
  const keep = () => {
    const el = box.current?.querySelector("canvas");
    if (!el) return;
    const a = document.createElement("a");
    a.href = el.toDataURL("image/png");
    a.download = `${word}.png`;
    a.click();
  };

  return (
    <main className="setup sketchbook">
      <header className="setup-head">
        <div className="suits" aria-hidden>
          🎨
        </div>
        <h1>Draw for fun</h1>
        <p>Draw & Guess needs people to guess. On your own, here's something to draw: nothing is scored.</p>
      </header>
      <button type="button" className="link" onClick={onLeave}>
        ← Back to Draw & Guess
      </button>
      <p className="sketch-word" aria-live="polite">
        Draw <strong>{word}</strong>
      </p>
      <div className="sketch-canvas" ref={box}>
        <Canvas
          canvas={canvas}
          onStroke={async (stroke) => {
            setStrokes((s) => [...s, stroke]);
            return true;
          }}
        />
      </div>
      <div className="sketch-actions">
        <button type="button" className="secondary" disabled={!strokes.length} onClick={() => setStrokes((s) => s.slice(0, -1))}>
          Undo
        </button>
        <button type="button" className="secondary" disabled={!strokes.length} onClick={() => setStrokes([])}>
          Start again
        </button>
        <button type="button" className="secondary" disabled={!strokes.length} onClick={keep}>
          Keep the picture
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (strokes.length) setDrawn((n) => n + 1);
            fresh();
          }}
        >
          {strokes.length ? "Next word" : "A different word"}
        </button>
      </div>
      {drawn > 0 && <p className="fine">{drawn === 1 ? "One drawing" : `${drawn} drawings`} so far.</p>}
    </main>
  );
}
