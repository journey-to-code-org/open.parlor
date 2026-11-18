// Road to the Shootout. The game is not the parlor's own code: it is a Rust engine compiled to
// WebAssembly, playing a pack of content, built in journey-to-code-org/wasm-toolkit and kept
// here as files (packages/wasm/public/shootout). This screen is the frame it is shown in.
import { useEffect, useRef } from "react";
import { loadName } from "../storage";

// The games compiled to WebAssembly are served beside the app, under wasm/.
const at = (page: string) => `${import.meta.env.BASE_URL}wasm/shootout/${page}`;

export function Shootout({ onHome }: { onHome: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  // The keys go to whichever page has the focus, so give it to the game as soon as it is there.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const focus = () => el.contentWindow?.focus();
    el.addEventListener("load", focus);
    return () => el.removeEventListener("load", focus);
  }, []);
  return (
    <div className="shootout">
      <header className="pinks-top">
        <button type="button" className="pinks-back" onClick={onHome}>← Games</button>
        <h1>🏁 Road to the Shootout</h1>
        <a className="shootout-workshop" href={at("workshop.html")} target="_blank" rel="noreferrer">The workshop</a>
      </header>
      {/* What the player goes by in the parlor is what the others at the game's meet see them as. */}
      <iframe ref={frame} className="shootout-game" src={at(loadName().trim() ? `?name=${encodeURIComponent(loadName().trim())}` : "")} title="Road to the Shootout" allow="autoplay; fullscreen" />
    </div>
  );
}
