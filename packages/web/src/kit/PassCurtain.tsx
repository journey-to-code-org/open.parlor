// Between people at a game that's passed round one device: the whole screen covered, so whoever
// hands it on doesn't see the next hand, and whoever takes it sees nothing until they're ready.
import { useEffect, useRef } from "react";

export function PassCurtain({ name, onReady }: { name: string; onReady: () => void }) {
  const ready = useRef<HTMLButtonElement>(null);
  useEffect(() => ready.current?.focus({ preventScroll: true }), [name]);
  return (
    <div className="pass-curtain" role="dialog" aria-modal="true" aria-labelledby="pass-title">
      <div className="pass-card">
        <div className="pass-icon" aria-hidden>
          📱
        </div>
        <h2 id="pass-title">Pass to {name}</h2>
        <p>Everyone else, look away: it's {name}'s turn, and their hand is about to show.</p>
        <button type="button" className="primary deal" ref={ready} onClick={onReady}>
          I'm {name}: show me
        </button>
      </div>
    </div>
  );
}
