// The fixture in Lit: a LitElement whose template uses the custom elements' tags, properties with
// .prop and events with @event. Unlike the other pages, everything here is inside a shadow root:
// the Zubra components are light-DOM elements in the LitElement's shadow tree, and their styles
// have to follow them there.
import { LitElement, html, nothing, unsafeCSS } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { CARDS, COLUMNS, EXTRA_ROW, ITEMS, ROWS, SEGMENTS, TABS, VARIANTS, type Row } from "../shared/fixture";
import shared from "../shared/styles.css?inline";
import "./features";
import "./zubra";
import "../shared/styles.css";

class ConformanceApp extends LitElement {
  static override styles = unsafeCSS(shared);
  static override properties = {
    variant: { state: true },
    count: { state: true },
    seg: { state: true },
    name: { state: true },
    on: { state: true },
    emptyClicks: { state: true },
    more: { state: true },
    open: { state: true },
    confirms: { state: true },
    items: { state: true },
    rows: { state: true },
    selected: { state: true },
    tab: { state: true },
    card: { state: true },
    picks: { state: true },
    bid: { state: true },
    temp: { state: true },
    tempOn: { state: true },
  };

  declare variant: number;
  declare count: number;
  declare seg: string;
  declare name: string;
  declare on: boolean;
  declare emptyClicks: number;
  declare more: boolean;
  declare open: boolean;
  declare confirms: number;
  declare items: string[];
  declare rows: Row[];
  declare selected: string[];
  declare tab: string;
  declare card: number;
  declare picks: number;
  declare bid: string;
  declare temp: boolean;
  declare tempOn: boolean;

  constructor() {
    super();
    this.variant = 0;
    this.count = 0;
    this.seg = "a";
    this.name = "";
    this.on = false;
    this.emptyClicks = 0;
    this.more = false;
    this.open = false;
    this.confirms = 0;
    this.items = [...ITEMS];
    this.rows = ROWS;
    this.selected = [];
    this.tab = "one";
    this.card = 0;
    this.picks = 0;
    this.bid = "";
    this.temp = true;
    this.tempOn = false;
  }

  override render() {
    return html`
      <main>
        <section>
          <h2>Props</h2>
          <status-badge data-t="badge" .variant=${VARIANTS[this.variant % VARIANTS.length]}>Status</status-badge>
          <button data-t="cycle" type="button" @click=${() => this.variant++}>Next variant</button>
          <status-badge data-t="count-badge">${this.count}</status-badge>
          <status-badge data-t="wrapped"><span data-t="wrapped-inner">${this.count}</span></status-badge>
          <button data-t="inc" type="button" @click=${() => this.count++}>Count</button>
        </section>

        <section>
          <h2>Events</h2>
          <segmented-control data-t="seg" .label=${"Letters"} .options=${SEGMENTS} .value=${this.seg} @valuechange=${(e: CustomEvent<string>) => (this.seg = e.detail)}></segmented-control>
          <output data-t="seg-out">${this.seg}</output>
          <button data-t="seg-set" type="button" @click=${() => (this.seg = "c")}>Set Gamma</button>
        </section>

        <section>
          <h2>Two-way</h2>
          <text-field data-t="name" .label=${"Name"} .value=${this.name} @valuechange=${(e: CustomEvent<string>) => (this.name = e.detail)}></text-field>
          <output data-t="name-out">${this.name}</output>
          <button data-t="name-set" type="button" @click=${() => (this.name = "Grammi")}>Set Grammi</button>
          <toggle-switch data-t="toggle" .label=${"Sound"} .checked=${this.on} @checkedchange=${(e: CustomEvent<boolean>) => (this.on = e.detail)}></toggle-switch>
          <output data-t="toggle-out">${this.on ? "on" : "off"}</output>
          <button data-t="toggle-off" type="button" @click=${() => (this.on = false)}>Switch off</button>
        </section>

        <section>
          <h2>Slots</h2>
          <empty-state data-t="empty" .heading=${"Nothing yet"}>
            <span>Body text</span>
            <action-button slot="actions" data-t="empty-action" @click=${() => this.emptyClicks++}>Do it</action-button>
          </empty-state>
          <output data-t="empty-out">${this.emptyClicks}</output>
          <alert-banner data-t="alert" .heading=${"Heads up"}>
            <span data-t="alert-msg">${this.more ? "Something more" : "Nothing more"}</span>
            ${this.more
              ? html`<span data-t="alert-extra"> and extra</span>
                  <action-button slot="actions" data-t="alert-action" .size=${"sm"}>Act</action-button>
                  <action-button slot="actions" data-t="alert-action-2" .size=${"sm"} .variant=${"outline"}>Skip</action-button>`
              : nothing}
          </alert-banner>
          <button data-t="alert-more" type="button" @click=${() => (this.more = !this.more)}>More</button>
        </section>

        <section>
          <h2>Dialog</h2>
          <button data-t="open" type="button" @click=${() => (this.open = true)}>Open</button>
          <output data-t="dialog-out">${this.open ? "open" : "closed"}</output>
          <output data-t="confirm-out">${this.confirms}</output>
          <modal-dialog data-t="dialog" .label=${"Sure?"} .open=${this.open} @openchange=${(e: CustomEvent<boolean>) => (this.open = e.detail)}>
            <p data-t="dialog-body">${this.name}</p>
            <action-button slot="actions" data-t="dialog-cancel" .variant=${"outline"} data-close="">Cancel</action-button>
            <action-button
              slot="actions"
              data-t="dialog-ok"
              @click=${() => {
                this.confirms++;
                this.open = false;
              }}
              >OK</action-button
            >
            ${this.name === "Grammi" ? html`<action-button slot="actions" data-t="dialog-extra" .variant=${"outline"}>For Grammi</action-button>` : nothing}
          </modal-dialog>
        </section>

        <section>
          <h2>Lists</h2>
          <stack-layout data-t="list" .gap=${"0.25rem"}>
            ${repeat(
              this.items,
              (item) => item,
              (item) => html`<status-badge data-item=${item}>${item}</status-badge>`,
            )}
          </stack-layout>
          <button data-t="add" type="button" @click=${() => (this.items = [...this.items, `item ${this.items.length + 1}`])}>Add</button>
          <button data-t="remove-first" type="button" @click=${() => (this.items = this.items.slice(1))}>Remove first</button>
        </section>

        <section>
          <h2>Table</h2>
          <data-table
            data-t="table"
            .label=${"Players"}
            .columns=${COLUMNS}
            .rows=${this.rows}
            .selectable=${true}
            .filterable=${false}
            .selected=${this.selected}
            @selectedchange=${(e: CustomEvent<string[]>) => (this.selected = e.detail)}
          ></data-table>
          <output data-t="table-out">${this.selected.join(",")}</output>
          <button data-t="table-select" type="button" @click=${() => (this.selected = ["r1", "r3"])}>Select first and last</button>
          <button data-t="table-add" type="button" @click=${() => (this.rows = [...ROWS, EXTRA_ROW])}>Add a row</button>
        </section>

        <section>
          <h2>Tabs</h2>
          <tab-list data-t="tabs" .label=${"Tabs"} .tabs=${TABS} .value=${this.tab} @valuechange=${(e: CustomEvent<string>) => (this.tab = e.detail)}>
            <section data-tab="one">First panel <span data-t="tab-count">${this.count}</span></section>
            <section data-tab="two">Second panel</section>
          </tab-list>
          <output data-t="tab-out">${this.tab}</output>
          <button data-t="tab-set" type="button" @click=${() => (this.tab = "one")}>Back to One</button>
        </section>

        <section>
          <h2>The parlor's own</h2>
          <playing-card data-t="card" .card=${CARDS[this.card % CARDS.length]} .playable=${true} @pick=${() => this.picks++}></playing-card>
          <output data-t="card-out">${this.picks}</output>
          <button data-t="card-next" type="button" @click=${() => this.card++}>Next card</button>
          <seat-badge data-t="seat" .name=${this.name || "Nobody"} .tricks=${this.count} .active=${true}></seat-badge>
          <bid-pad data-t="bid" @bid=${(e: CustomEvent<number | string>) => (this.bid = String(e.detail))}></bid-pad>
          <output data-t="bid-out">${this.bid}</output>
        </section>

        <section>
          <h2>Coming and going</h2>
          <span data-t="temp-home"
            >${this.temp
              ? html`<toggle-switch data-t="temp" .label=${"Comes and goes"} .checked=${this.tempOn} @checkedchange=${(e: CustomEvent<boolean>) => (this.tempOn = e.detail)}></toggle-switch>`
              : nothing}</span
          >
          <output data-t="temp-out">${this.tempOn ? "on" : "off"}</output>
          <button
            data-t="remount"
            type="button"
            @click=${() => {
              this.temp = !this.temp;
              this.tempOn = false;
            }}
          >
            Take away / bring back
          </button>
        </section>
      </main>
    `;
  }
}
customElements.define("conformance-app", ConformanceApp);

document.getElementById("app")!.append(document.createElement("conformance-app"), document.createElement("conformance-features"));
