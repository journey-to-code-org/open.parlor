// Delbie's Counter in this browser. The game's screen is a Vue island made of Zubra components
// (Counter.vue) and its play is a plain store (shift.ts); this is only the React around them: the
// way in from the setup screen, the way back, the sounds, and the score kept on this device and
// sent to a house.
import type { ArcadeEvent } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";
import { createApp, h, reactive } from "vue";
import { sendRun } from "../arcade/scores";
import { blip, crash, notes, wakeArcadeSound } from "../arcade/sounds";
import { loadArcadeHouse, saveArcadeBest, type ArcadeRules } from "../storage";
import Counter from "./Counter.vue";
import { startShift } from "./shift";

interface Props {
  rules: ArcadeRules;
  seed: number;
  /** Back to the game's setup screen. */
  onLeave: () => void;
}

function sounds(events: readonly ArcadeEvent[]) {
  for (const e of events) {
    if (e.kind === "arrive") notes([880, 660], 90, 0.12);
    else if (e.kind === "ring") blip(1200, 0.04, "square", 0.03);
    else if (e.kind === "sale" || e.kind === "sorted") notes([523, 784, 1047], 70, 0.12);
    else if (e.kind === "wrong") blip(150, 0.3, "sawtooth", 0.06, -60);
    else if (e.kind === "walk") crash(0.15, 0.05);
    else if (e.kind === "over") notes([392, 523, 659, 784], 140, 0.2);
  }
}

export function CounterTable({ rules, seed, onLeave }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    wakeArcadeSound();
    const playing = seed + run;
    const house = loadArcadeHouse();
    const props = reactive({ ending: null as { line: string; score: number; best: boolean } | null });
    const shift = startShift(rules, playing, ({ summary, log }) => {
      props.ending = { line: summary.scoreLine, score: summary.score, best: saveArcadeBest("counter", rules, 1, summary.score) };
      if (house) void sendRun(house.slug, { game: "counter", rules, seats: 1, seed: playing, log, score: summary.score }).catch(() => undefined);
    });
    const app = createApp({ render: () => h(Counter, { shift, ending: props.ending, onEvents: sounds, onAgain: () => setRun((n) => n + 1), onLeave }) });
    app.mount(el.current!);
    return () => {
      shift.stop();
      app.unmount();
    };
    // A new shift is a new island: nothing of the last one is carried over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return (
    <main className="counter-page">
      <div className="counter-top">
        <button type="button" className="arcade-btn" onClick={onLeave}>‹ Back</button>
        <h1>Delbie's Counter</h1>
      </div>
      <div ref={el} />
    </main>
  );
}
