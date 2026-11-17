// React's own features around Zubra components: keys, context, className and style, portals,
// lazy and Suspense, Activity, and spread props. The checks are in tests/features.spec.ts.
import EmptyState from "@open-parlor/ui/zubra-ui/empty-state.zb";
import StackLayout from "@open-parlor/ui/zubra-ui/stack-layout.zb";
import StatusBadge from "@open-parlor/ui/zubra-ui/status-badge.zb";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import ToggleSwitch from "@open-parlor/ui/zubra-ui/toggle-switch.zb";
import { Activity, Suspense, createContext, lazy, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { FACES, VARIANTS, WORDS } from "../shared/fixture";

const Lazy = lazy(() => import("./lazy"));
const WordContext = createContext<string>("");

/** The page's own component, put in a Zubra component's slot. */
function Word() {
  return <span data-t="f-ctx">{useContext(WordContext)}</span>;
}

export function Features() {
  const [faces, setFaces] = useState(FACES);
  const [word, setWord] = useState<string>(WORDS[0]);
  const [hot, setHot] = useState(false);
  const [far, setFar] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [kept, setKept] = useState(true);
  const [spread, setSpread] = useState(0);
  const badge = { variant: VARIANTS[spread % VARIANTS.length], dot: true };

  return (
    <main data-t="f-features">
      <section>
        <h2>A keyed list, reordered</h2>
        <StackLayout data-t="f-order" gap="0.25rem">
          {faces.map((face) => (
            <StatusBadge key={face} data-f-item={face}>
              {face}
            </StatusBadge>
          ))}
        </StackLayout>
        <button data-t="f-reverse" type="button" onClick={() => setFaces([...faces].reverse())}>
          Reverse
        </button>
      </section>

      <section>
        <h2>Context through a slot</h2>
        <WordContext value={word}>
          <EmptyState data-t="f-ctx-home" heading="Context">
            <Word />
          </EmptyState>
        </WordContext>
        <button data-t="f-ctx-set" type="button" onClick={() => setWord(WORDS[1])}>
          Change the word
        </button>
      </section>

      <section>
        <h2>className and style</h2>
        <StatusBadge data-t="f-styled" className={hot ? "f-hot" : undefined} style={{ opacity: hot ? 0.5 : 1 }}>
          Styled
        </StatusBadge>
        <button data-t="f-style-toggle" type="button" onClick={() => setHot(!hot)}>
          Toggle
        </button>
      </section>

      <section>
        <h2>Somewhere else on the page (createPortal)</h2>
        {createPortal(<ToggleSwitch data-t="f-portal" label="Far away" checked={far} onCheckedChange={(e: CustomEvent<boolean>) => setFar(e.detail)} />, document.body)}
        <output data-t="f-portal-out">{far ? "on" : "off"}</output>
        <button data-t="f-portal-off" type="button" onClick={() => setFar(false)}>
          Switch off
        </button>
      </section>

      <section>
        <h2>Loaded later (lazy and Suspense)</h2>
        {wanted ? (
          <Suspense fallback={<span data-t="f-lazy-wait">Waiting</span>}>
            <Lazy />
          </Suspense>
        ) : (
          <span data-t="f-lazy-wait">Waiting</span>
        )}
        <button data-t="f-lazy-load" type="button" onClick={() => setWanted(true)}>
          Load
        </button>
      </section>

      <section>
        <h2>Kept while off the page (Activity)</h2>
        <Activity mode={kept ? "visible" : "hidden"}>
          <TextField data-t="f-kept" label="Kept" />
        </Activity>
        <button data-t="f-keep-toggle" type="button" onClick={() => setKept(!kept)}>
          Hide / show
        </button>
      </section>

      <section>
        <h2>Props from an object (spread)</h2>
        <StatusBadge data-t="f-spread" {...badge}>
          Spread
        </StatusBadge>
        <button data-t="f-spread-next" type="button" onClick={() => setSpread(spread + 1)}>
          Next
        </button>
      </section>
    </main>
  );
}
