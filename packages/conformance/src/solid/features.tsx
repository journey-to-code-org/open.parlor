/* @jsxImportSource solid-js */
// Solid's own features around Zubra components: For, context, classList and style, Portal, lazy
// and Suspense, spread props and Dynamic. The checks are in tests/features.spec.ts.
//
// Solid sets what it is given on a custom element as a property unless told otherwise, so a
// data- attribute that isn't a plain string is written attr:data-…, as on the main page.
import { For, Show, Suspense, createContext, createSignal, lazy, useContext, type Accessor } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import { FACES, VARIANTS, WORDS } from "../shared/fixture";

const Lazy = lazy(() => import("./lazy"));
const WordContext = createContext<Accessor<string>>(() => "");

/** The page's own component, put in a Zubra component's slot. */
function Word() {
  const word = useContext(WordContext);
  return <span data-t="f-ctx">{word()}</span>;
}

export function Features() {
  const [faces, setFaces] = createSignal([...FACES]);
  const [word, setWord] = createSignal<string>(WORDS[0]);
  const [hot, setHot] = createSignal(false);
  const [far, setFar] = createSignal(false);
  const [wanted, setWanted] = createSignal(false);
  const [spread, setSpread] = createSignal(0);
  const badge = () => ({ variant: VARIANTS[spread() % VARIANTS.length], dot: true });
  const [tag, setTag] = createSignal("status-badge");
  const [presses, setPresses] = createSignal(0);

  return (
    <main data-t="f-features">
      <section>
        <h2>A keyed list, reordered (For)</h2>
        <stack-layout data-t="f-order" prop:gap="0.25rem">
          <For each={faces()}>{(face) => <status-badge attr:data-f-item={face}>{face}</status-badge>}</For>
        </stack-layout>
        <button data-t="f-reverse" type="button" onClick={() => setFaces([...faces()].reverse())}>
          Reverse
        </button>
      </section>

      <section>
        <h2>Context through a slot</h2>
        <WordContext.Provider value={word}>
          <empty-state data-t="f-ctx-home" prop:heading="Context">
            <Word />
          </empty-state>
        </WordContext.Provider>
        <button data-t="f-ctx-set" type="button" onClick={() => setWord(WORDS[1])}>
          Change the word
        </button>
      </section>

      <section>
        <h2>classList and style</h2>
        <status-badge data-t="f-styled" classList={{ "f-hot": hot() }} style={{ opacity: hot() ? 0.5 : 1 }}>
          Styled
        </status-badge>
        <button data-t="f-style-toggle" type="button" onClick={() => setHot(!hot())}>
          Toggle
        </button>
      </section>

      <section>
        <h2>Somewhere else on the page (Portal)</h2>
        <Portal>
          <toggle-switch data-t="f-portal" prop:label="Far away" prop:checked={far()} on:checkedchange={(e: CustomEvent<boolean>) => setFar(e.detail)} />
        </Portal>
        <output data-t="f-portal-out">{far() ? "on" : "off"}</output>
        <button data-t="f-portal-off" type="button" onClick={() => setFar(false)}>
          Switch off
        </button>
      </section>

      <section>
        <h2>Loaded later (lazy and Suspense)</h2>
        <Show when={wanted()} fallback={<span data-t="f-lazy-wait">Waiting</span>}>
          <Suspense fallback={<span data-t="f-lazy-wait">Waiting</span>}>
            <Lazy />
          </Suspense>
        </Show>
        <button data-t="f-lazy-load" type="button" onClick={() => setWanted(true)}>
          Load
        </button>
      </section>

      <section>
        <h2>Props from an object (spread)</h2>
        <status-badge data-t="f-spread" {...badge()}>
          Spread
        </status-badge>
        <button data-t="f-spread-next" type="button" onClick={() => setSpread(spread() + 1)}>
          Next
        </button>
      </section>

      <section>
        <h2>A tag chosen at run time (Dynamic)</h2>
        <Dynamic component={tag()} attr:data-t="f-dyn" onClick={() => setPresses(presses() + 1)}>
          Dynamic
        </Dynamic>
        <output data-t="f-dyn-out">{presses()}</output>
        <button data-t="f-dyn-next" type="button" onClick={() => setTag("action-button")}>
          Make it a button
        </button>
      </section>
    </main>
  );
}
