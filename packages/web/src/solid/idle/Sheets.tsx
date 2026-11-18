/* @jsxImportSource solid-js */
// What Delbie's Counter puts over the store: the incident report from while you were out, which of
// two stores to keep, moving the store, closing it. Each is a sheet with a heading, some words and
// its buttons; the store (idle/IdleTable.tsx, React) says which are open and what each button does.
// A Solid island over the React screen.
import { For, Index, Show, createMemo, createSignal, onMount } from "solid-js";
import { render } from "solid-js/web";

export interface Sheet {
  /** The dialog's name, for a screen reader. */
  label: string;
  heading: string;
  /** Paragraphs. */
  says?: string[];
  /** A list, as the incident report has. */
  lines?: string[];
  /** A smaller line under it. */
  fine?: string;
  /** Buttons, in order. The one with `ready` has the focus when the sheet opens. */
  buttons: { text: string; yes?: boolean; ready?: boolean; act: () => void }[];
}

const focused = (button: HTMLButtonElement) => onMount(() => button.focus());

function Sheets(props: { now: () => Sheet[] }) {
  // The store is drawn again several times a second, and hands over new sheets each time: each
  // sheet is kept by its label, and each button by its place, so nothing is made again (and the
  // focus isn't taken back) while a sheet stays open.
  const labels = createMemo(() => props.now().map((sheet) => sheet.label), undefined, { equals: (a, b) => a.join("\n") === b.join("\n") });
  return (
    <For each={labels()}>
      {(label) => {
        const sheet = () => props.now().find((s) => s.label === label) ?? { label, heading: "", buttons: [] };
        return (
          <div class="delbies-sheet" role="dialog" aria-label={label}>
            <div>
              <h2>{sheet().heading}</h2>
              <Index each={sheet().says ?? []}>{(words) => <p>{words()}</p>}</Index>
              <Show when={sheet().lines}>
                <ul>
                  <Index each={sheet().lines}>{(line) => <li>{line()}</li>}</Index>
                </ul>
              </Show>
              <Show when={sheet().fine}>
                <p class="fine">{sheet().fine}</p>
              </Show>
              <div class="row">
                <Index each={sheet().buttons}>
                  {(button) => (
                    <button type="button" class={button().yes ? "yes" : undefined} ref={(el) => button().ready && focused(el)} onClick={() => button().act()}>
                      {button().text}
                    </button>
                  )}
                </Index>
              </div>
            </div>
          </div>
        );
      }}
    </For>
  );
}

/** Draw the open sheets into `into`; `update` hands them the ones open now. */
export function mountIdleSheets(into: HTMLElement, first: Sheet[]) {
  const [now, setNow] = createSignal(first, { equals: false });
  const dispose = render(() => <Sheets now={now} />, into);
  return {
    update: (next: Sheet[]) => {
      setNow(() => next);
    },
    dispose,
  };
}
