/** @jsxImportSource preact */
// The fixture in Preact: the custom elements' tags. Preact sets a prop as a property when the
// element has one, and on<name> listens for the event of that name.
import { render } from "preact";
import { useState } from "preact/hooks";
import { CARDS, COLUMNS, EXTRA_ROW, ITEMS, ROWS, SEGMENTS, TABS, VARIANTS } from "../shared/fixture";
import { Features } from "./features";
import "./zubra";
import "../shared/styles.css";

function App() {
  const [variant, setVariant] = useState(0);
  const [count, setCount] = useState(0);
  const [seg, setSeg] = useState("a");
  const [name, setName] = useState("");
  const [on, setOn] = useState(false);
  const [emptyClicks, setEmptyClicks] = useState(0);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirms, setConfirms] = useState(0);
  const [items, setItems] = useState([...ITEMS]);
  const [rows, setRows] = useState(ROWS);
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState("one");
  const [card, setCard] = useState(0);
  const [picks, setPicks] = useState(0);
  const [bid, setBid] = useState("");
  const [temp, setTemp] = useState(true);
  const [tempOn, setTempOn] = useState(false);

  return (
    <main>
      <section>
        <h2>Props</h2>
        <status-badge data-t="badge" variant={VARIANTS[variant % VARIANTS.length]}>
          Status
        </status-badge>
        <button data-t="cycle" type="button" onClick={() => setVariant(variant + 1)}>
          Next variant
        </button>
        <status-badge data-t="count-badge">{count}</status-badge>
        <status-badge data-t="wrapped">
          <span data-t="wrapped-inner">{count}</span>
        </status-badge>
        <button data-t="inc" type="button" onClick={() => setCount(count + 1)}>
          Count
        </button>
      </section>

      <section>
        <h2>Events</h2>
        <segmented-control data-t="seg" label="Letters" options={SEGMENTS} value={seg} onvaluechange={(e: CustomEvent<string>) => setSeg(e.detail)} />
        <output data-t="seg-out">{seg}</output>
        <button data-t="seg-set" type="button" onClick={() => setSeg("c")}>
          Set Gamma
        </button>
      </section>

      <section>
        <h2>Two-way</h2>
        <text-field data-t="name" label="Name" value={name} onvaluechange={(e: CustomEvent<string>) => setName(e.detail)} />
        <output data-t="name-out">{name}</output>
        <button data-t="name-set" type="button" onClick={() => setName("Grammi")}>
          Set Grammi
        </button>
        <toggle-switch data-t="toggle" label="Sound" checked={on} oncheckedchange={(e: CustomEvent<boolean>) => setOn(e.detail)} />
        <output data-t="toggle-out">{on ? "on" : "off"}</output>
        <button data-t="toggle-off" type="button" onClick={() => setOn(false)}>
          Switch off
        </button>
      </section>

      <section>
        <h2>Slots</h2>
        <empty-state data-t="empty" heading="Nothing yet">
          <span>Body text</span>
          <action-button slot="actions" data-t="empty-action" onClick={() => setEmptyClicks(emptyClicks + 1)}>
            Do it
          </action-button>
        </empty-state>
        <output data-t="empty-out">{emptyClicks}</output>
        <alert-banner data-t="alert" heading="Heads up">
          <span data-t="alert-msg">{more ? "Something more" : "Nothing more"}</span>
          {more && (
            <>
              <span data-t="alert-extra"> and extra</span>
              <action-button slot="actions" data-t="alert-action" size="sm">
                Act
              </action-button>
              <action-button slot="actions" data-t="alert-action-2" size="sm" variant="outline">
                Skip
              </action-button>
            </>
          )}
        </alert-banner>
        <button data-t="alert-more" type="button" onClick={() => setMore(!more)}>
          More
        </button>
      </section>

      <section>
        <h2>Dialog</h2>
        <button data-t="open" type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        <output data-t="dialog-out">{open ? "open" : "closed"}</output>
        <output data-t="confirm-out">{confirms}</output>
        <modal-dialog data-t="dialog" label="Sure?" open={open} onopenchange={(e: CustomEvent<boolean>) => setOpen(e.detail)}>
          <p data-t="dialog-body">{name}</p>
          <action-button slot="actions" data-t="dialog-cancel" variant="outline" data-close="">
            Cancel
          </action-button>
          <action-button
            slot="actions"
            data-t="dialog-ok"
            onClick={() => {
              setConfirms(confirms + 1);
              setOpen(false);
            }}
          >
            OK
          </action-button>
          {name === "Grammi" && (
            <>
              <action-button slot="actions" data-t="dialog-extra" variant="outline">
                For Grammi
              </action-button>
            </>
          )}
        </modal-dialog>
      </section>

      <section>
        <h2>Lists</h2>
        <stack-layout data-t="list" gap="0.25rem">
          {items.map((item) => (
            <status-badge key={item} data-item={item}>
              {item}
            </status-badge>
          ))}
        </stack-layout>
        <button data-t="add" type="button" onClick={() => setItems([...items, `item ${items.length + 1}`])}>
          Add
        </button>
        <button data-t="remove-first" type="button" onClick={() => setItems(items.slice(1))}>
          Remove first
        </button>
      </section>

      <section>
        <h2>Table</h2>
        <data-table
          data-t="table"
          label="Players"
          columns={COLUMNS}
          rows={rows}
          selectable={true}
          filterable={false}
          selected={selected}
          onselectedchange={(e: CustomEvent<string[]>) => setSelected(e.detail)}
        />
        <output data-t="table-out">{selected.join(",")}</output>
        <button data-t="table-select" type="button" onClick={() => setSelected(["r1", "r3"])}>
          Select first and last
        </button>
        <button data-t="table-add" type="button" onClick={() => setRows([...ROWS, EXTRA_ROW])}>
          Add a row
        </button>
      </section>

      <section>
        <h2>Tabs</h2>
        <tab-list data-t="tabs" label="Tabs" tabs={TABS} value={tab} onvaluechange={(e: CustomEvent<string>) => setTab(e.detail)}>
          <section data-tab="one">
            First panel <span data-t="tab-count">{count}</span>
          </section>
          <section data-tab="two">Second panel</section>
        </tab-list>
        <output data-t="tab-out">{tab}</output>
        <button data-t="tab-set" type="button" onClick={() => setTab("one")}>
          Back to One
        </button>
      </section>

      <section>
        <h2>The parlor's own</h2>
        <playing-card data-t="card" card={CARDS[card % CARDS.length]} playable={true} onpick={() => setPicks(picks + 1)} />
        <output data-t="card-out">{picks}</output>
        <button data-t="card-next" type="button" onClick={() => setCard(card + 1)}>
          Next card
        </button>
        <seat-badge data-t="seat" name={name || "Nobody"} tricks={count} active={true} />
        <bid-pad data-t="bid" onbid={(e: CustomEvent<number | string>) => setBid(String(e.detail))} />
        <output data-t="bid-out">{bid}</output>
      </section>

      <section>
        <h2>Coming and going</h2>
        <span data-t="temp-home">
          {temp && (
            <>
              <toggle-switch data-t="temp" label="Comes and goes" checked={tempOn} oncheckedchange={(e: CustomEvent<boolean>) => setTempOn(e.detail)} />
            </>
          )}
        </span>
        <output data-t="temp-out">{tempOn ? "on" : "off"}</output>
        <button
          data-t="remount"
          type="button"
          onClick={() => {
            setTemp(!temp);
            setTempOn(false);
          }}
        >
          Take away / bring back
        </button>
      </section>
    </main>
  );
}

render(
  <>
    <App />
    <Features />
  </>,
  document.getElementById("app")!,
);
