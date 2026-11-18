/** @jsxImportSource preact */
// Preact's own features around Zubra components: keys, context, class and style, createPortal,
// lazy and Suspense, and spread props. The checks are in tests/features.spec.ts.
import { createContext } from "preact";
import { Suspense, createPortal, lazy } from "preact/compat";
import { useContext, useState } from "preact/hooks";
import { FACES, VARIANTS, WORDS } from "../shared/fixture";

const Lazy = lazy(() => import("./lazy"));
const WordContext = createContext<string>("");

/** The page's own component, put in a Zubra component's slot. */
function Word() {
  return <span data-t="f-ctx">{useContext(WordContext)}</span>;
}

export function Features() {
  const [faces, setFaces] = useState([...FACES]);
  const [word, setWord] = useState<string>(WORDS[0]);
  const [hot, setHot] = useState(false);
  const [far, setFar] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [spread, setSpread] = useState(0);
  const badge = { variant: VARIANTS[spread % VARIANTS.length], dot: true };

  return (
    <main data-t="f-features">
      <section>
        <h2>A keyed list, reordered</h2>
        <stack-layout data-t="f-order" gap="0.25rem">
          {faces.map((face) => (
            <status-badge key={face} data-f-item={face}>
              {face}
            </status-badge>
          ))}
        </stack-layout>
        <button data-t="f-reverse" type="button" onClick={() => setFaces([...faces].reverse())}>
          Reverse
        </button>
      </section>

      <section>
        <h2>Context through a slot</h2>
        <WordContext.Provider value={word}>
          <empty-state data-t="f-ctx-home" heading="Context">
            <Word />
          </empty-state>
        </WordContext.Provider>
        <button data-t="f-ctx-set" type="button" onClick={() => setWord(WORDS[1])}>
          Change the word
        </button>
      </section>

      <section>
        <h2>class and style</h2>
        <status-badge data-t="f-styled" class={hot ? "f-hot" : undefined} style={{ opacity: hot ? 0.5 : 1 }}>
          Styled
        </status-badge>
        <button data-t="f-style-toggle" type="button" onClick={() => setHot(!hot)}>
          Toggle
        </button>
      </section>

      <section>
        <h2>Somewhere else on the page (createPortal)</h2>
        {createPortal(<toggle-switch data-t="f-portal" label="Far away" checked={far} oncheckedchange={(e: CustomEvent<boolean>) => setFar(e.detail)} />, document.body)}
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
        <h2>Props from an object (spread)</h2>
        <status-badge data-t="f-spread" {...badge}>
          Spread
        </status-badge>
        <button data-t="f-spread-next" type="button" onClick={() => setSpread(spread + 1)}>
          Next
        </button>
      </section>
    </main>
  );
}
