/* @jsxImportSource solid-js */
// What the arcade table puts over a game: the pause sheet (the game's controls, carry on, leave)
// and the game-over sheet (the score, the best, the house's board, the run's numbers, play again).
// A Solid island over the React table (arcade/ArcadeTable.tsx), handed what to show as it changes;
// the words and numbers come ready to show, worked out where the game is. Lists are kept by place
// (Index), so a new render's new arrays don't make them again.
import { For, Index, Match, Show, Switch, createSignal, onMount } from "solid-js";
import { render } from "solid-js/web";

export interface SheetsProps {
  paused: boolean;
  /** The game's controls, in its own words. */
  controls: string[];
  ending: null | {
    final: string;
    /** Your best, or that it's a new one; for a shared table, that it was everyone's. */
    best: string;
    rival: string | null;
    /** A market game: every chip earned in the run. */
    market: boolean;
    /** How far the run got (not for a market game). */
    stage: string | null;
    time: string;
    /** Each seat's score, when there was more than one. */
    pairs: { who: string; points: string }[];
  };
  /** The house this device posts its runs to, and how the post went. */
  house: null | { name: string; posted: null | { state: "sending" } | { state: "failed" } | { state: "done"; line: string; top: { key: string; who: string; points: string; me: boolean }[] } };
  shared: boolean;
  /** The play-again button's words; none at a shared table. */
  again: string;
  onCarryOn: () => void;
  onLeave: () => void;
  onAgain: () => void;
}

/** Focus a button when it's drawn, as autoFocus would. */
const focused = (button: HTMLButtonElement) => onMount(() => button.focus());

function Sheets(props: { now: () => SheetsProps }) {
  const p = () => props.now();
  return (
    <>
      <Show when={p().paused && !p().ending}>
        <section class="arcade-sheet" aria-label="Paused">
          <div class="arcade-card">
            <h2>Paused</h2>
            <ul class="arcade-controls">
              <For each={p().controls}>{(line) => <li>{line}</li>}</For>
            </ul>
            <div class="arcade-row">
              <button type="button" class="primary" ref={focused} onClick={() => p().onCarryOn()}>
                Carry on
              </button>
              <button type="button" class="secondary" onClick={() => p().onLeave()}>
                Leave the game
              </button>
            </div>
          </div>
        </section>
      </Show>
      <Show when={p().ending}>
        {(ending) => (
          <section class="arcade-sheet" aria-label="Game over">
            <div class="arcade-card">
              <h2>Game over</h2>
              <div class="arcade-final">{ending().final}</div>
              <p>{ending().best}</p>
              <Show when={ending().rival}>
                <p class="arcade-rival">{ending().rival}</p>
              </Show>
              <Show when={p().house?.posted && p().house}>
                {(house) => (
                  <div class="arcade-house">
                    <Switch>
                      <Match when={house().posted!.state === "sending"}>
                        <p>Sending the run to {house().name}…</p>
                      </Match>
                      <Match when={house().posted!.state === "failed"}>
                        <p>{house().name} could not be reached, so this run stays here.</p>
                      </Match>
                      <Match when={house().posted!.state === "done" && (house().posted as Extract<NonNullable<NonNullable<SheetsProps["house"]>["posted"]>, { state: "done" }>)}>
                        {(done) => (
                          <>
                            <p>{done().line}</p>
                            <ol>
                              <Index each={done().top}>
                                {(row) => (
                                  <li class={row().me ? "mine" : ""}>
                                    <b>{row().who}</b>
                                    <span>{row().points}</span>
                                  </li>
                                )}
                              </Index>
                            </ol>
                          </>
                        )}
                      </Match>
                    </Switch>
                  </div>
                )}
              </Show>
              <Show when={ending().market}>
                <p>Every chip earned in the run.</p>
              </Show>
              <dl class="arcade-stats">
                <Show when={ending().stage !== null}>
                  <dt>Reached</dt>
                  <dd>{ending().stage}</dd>
                </Show>
                <dt>Time</dt>
                <dd>{ending().time}</dd>
                <Index each={ending().pairs}>
                  {(pair) => (
                    <div class="arcade-pair">
                      <dt>{pair().who}</dt>
                      <dd>{pair().points}</dd>
                    </div>
                  )}
                </Index>
              </dl>
              <div class="arcade-row">
                <Show when={!p().shared}>
                  <button type="button" class="primary" ref={focused} onClick={() => p().onAgain()}>
                    {p().again}
                  </button>
                </Show>
                <button type="button" class={p().shared ? "primary" : "secondary"} onClick={() => p().onLeave()}>
                  {p().shared ? "Leave the table" : "Change the rules"}
                </button>
              </div>
            </div>
          </section>
        )}
      </Show>
    </>
  );
}

/** Draw the sheets into `into`; `update` hands them what to show now. */
export function mountArcadeSheets(into: HTMLElement, first: SheetsProps) {
  const [now, setNow] = createSignal(first, { equals: false });
  const dispose = render(() => <Sheets now={now} />, into);
  return {
    update: (next: SheetsProps) => {
      setNow(() => next);
    },
    dispose,
  };
}
