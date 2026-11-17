// Lit's own features around Zubra components: repeat, @lit/context, classMap and styleMap, until,
// cache and keyed. The checks are in tests/features.spec.ts.
import { ContextConsumer, ContextProvider, createContext } from "@lit/context";
import { LitElement, html, unsafeCSS } from "lit";
import { cache } from "lit/directives/cache.js";
import { classMap } from "lit/directives/class-map.js";
import { keyed } from "lit/directives/keyed.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { until } from "lit/directives/until.js";
import { FACES, WORDS } from "../shared/fixture";
import shared from "../shared/styles.css?inline";
import "./zubra";

const wordContext = createContext<string>("word");

/** The page's own element, put in a Zubra component's slot: it asks for the page's word. */
class FeatureWord extends LitElement {
  readonly #word = new ContextConsumer(this, { context: wordContext, subscribe: true });

  override render() {
    return html`<span data-t="f-ctx">${this.#word.value}</span>`;
  }
}
customElements.define("f-word", FeatureWord);

const waiting = html`<span data-t="f-lazy-wait">Waiting</span>`;

class ConformanceFeatures extends LitElement {
  static override styles = unsafeCSS(shared);
  static override properties = {
    faces: { state: true },
    hot: { state: true },
    wanted: { state: true },
    kept: { state: true },
    key: { state: true },
  };

  declare faces: string[];
  declare hot: boolean;
  declare wanted: boolean;
  declare kept: boolean;
  declare key: number;

  readonly #word = new ContextProvider(this, { context: wordContext, initialValue: WORDS[0] as string });

  constructor() {
    super();
    this.faces = [...FACES];
    this.hot = false;
    this.wanted = false;
    this.kept = true;
    this.key = 0;
  }

  override render() {
    return html`
      <main data-t="f-features">
        <section>
          <h2>A keyed list, reordered (repeat)</h2>
          <stack-layout data-t="f-order" .gap=${"0.25rem"}>
            ${repeat(
              this.faces,
              (face) => face,
              (face) => html`<status-badge data-f-item=${face}>${face}</status-badge>`,
            )}
          </stack-layout>
          <button data-t="f-reverse" type="button" @click=${() => (this.faces = [...this.faces].reverse())}>Reverse</button>
        </section>

        <section>
          <h2>Context through a slot (@lit/context)</h2>
          <empty-state data-t="f-ctx-home" .heading=${"Context"}><f-word></f-word></empty-state>
          <button data-t="f-ctx-set" type="button" @click=${() => this.#word.setValue(WORDS[1])}>Change the word</button>
        </section>

        <section>
          <h2>classMap and styleMap</h2>
          <status-badge data-t="f-styled" class=${classMap({ "f-hot": this.hot })} style=${styleMap({ opacity: this.hot ? 0.5 : 1 })}>Styled</status-badge>
          <button data-t="f-style-toggle" type="button" @click=${() => (this.hot = !this.hot)}>Toggle</button>
        </section>

        <section>
          <h2>Loaded later (until)</h2>
          ${this.wanted
            ? until(
                import("./lazy").then(() => html`<f-lazy></f-lazy>`),
                waiting,
              )
            : waiting}
          <button data-t="f-lazy-load" type="button" @click=${() => (this.wanted = true)}>Load</button>
        </section>

        <section>
          <h2>Kept while off the page (cache)</h2>
          ${cache(this.kept ? html`<text-field data-t="f-kept" .label=${"Kept"}></text-field>` : html`<span>Put away</span>`)}
          <button data-t="f-keep-toggle" type="button" @click=${() => (this.kept = !this.kept)}>Hide / show</button>
        </section>

        <section>
          <h2>Made afresh (keyed)</h2>
          ${keyed(this.key, html`<toggle-switch data-t="f-keyed" .label=${"Fresh"}></toggle-switch>`)}
          <button data-t="f-key-next" type="button" @click=${() => this.key++}>Next key</button>
        </section>
      </main>
    `;
  }
}
customElements.define("conformance-features", ConformanceFeatures);
