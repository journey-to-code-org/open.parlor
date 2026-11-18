// Delbie's Stockroom: run the parts store's stockroom for twenty-eight days.
//
// The sim is WebAssembly (games/market); this page is Solid, and everything on it that isn't text is
// a Zubra component (see zubra.ts). They are custom elements, so Solid sets their properties with
// `prop:` and listens to their events with `on:`. The page exists to give Zubra a real job: a table
// of forty-eight rows whose cells change many times a second, tickers and bars that follow them,
// charts that move on the hour, and controls that have to stay put under all of it.
import { For, Match, Show, Switch, createEffect, createMemo, createResource, createSignal, on, untrack } from "solid-js";
import { PARTS, SHELVES, SPEEDS, dollars, money, perDay } from "../catalog.ts";
import { PHASE } from "../sim.ts";
import { REDRAWS, best, createGame, toast, type Game, type Redraw } from "./store.ts";

const WASM = new URL("../../../games/market/market.wasm", import.meta.url).href;

const TABS = [
  { value: "stock", label: "Stock" },
  { value: "part", label: "A part" },
  { value: "shelves", label: "Shelves" },
  { value: "news", label: "News" },
  { value: "hood", label: "Under the hood" },
];

const COLUMNS = [
  { key: "part", label: "Part", sortable: true },
  { key: "shelf", label: "Shelf", sortable: true },
  { key: "stock", label: "Stock", sortable: true, format: "number" },
  { key: "truck", label: "Truck", sortable: true, format: "number" },
  { key: "cost", label: "Wholesale", sortable: true, format: "currency" },
  { key: "price", label: "Price", sortable: true, format: "currency" },
  { key: "margin", label: "Margin %", sortable: true, format: "number" },
  { key: "sold", label: "Sold today", sortable: true, format: "number" },
];

const MARKUPS = [
  { value: "125", label: "125%" },
  { value: "150", label: "150%" },
  { value: "175", label: "175%" },
  { value: "200", label: "200%" },
];

const REDRAW_OPTIONS: { value: Redraw; label: string }[] = [
  { value: "frame", label: "Every frame" },
  { value: "10", label: "10 a second" },
  { value: "2", label: "2 a second" },
];

/** A nickel: the sim keeps prices to five cents. */
const nickel = (cents: number) => Math.max(5, Math.round(cents / 5) * 5);
const clockText = (hour: number) => `${hour % 12 || 12}:00 ${hour < 12 ? "am" : "pm"}`;
const asEvent = <T,>(event: Event) => (event as CustomEvent<T>).detail;

/** Stars for the month, by how many times over the store's starting worth it ended. */
function stars(worth: number, start: number, phase: number) {
  if (phase === PHASE.BROKE) return 1;
  const times = worth / Math.max(1, start);
  // A bot that keeps the shelves full at 160% and sets two traps ends near 1.7: that is four stars.
  return times < 0.9 ? 1 : times < 1.2 ? 2 : times < 1.6 ? 3 : times < 2 ? 4 : 5;
}

export function App() {
  const params = new URLSearchParams(location.search);
  const first = Number(params.get("seed")) || Math.floor(Math.random() * 1_000_000) + 1;
  const [game] = createResource(() => createGame(WASM, first));
  return (
    <main class="page stockroom">
      <header class="top">
        <a class="home" href="../../">
          ← open.parlor
        </a>
        <h1>Delbie's Stockroom</h1>
        <p class="quiet">
          Twenty-eight days to run the back room: wholesale prices that never sit still, a shelf to price, rats in the cardboard, and rent every seventh day. Make the store worth more than it was.
        </p>
      </header>
      <Switch>
        <Match when={game.error}>
          <alert-banner prop:variant="danger" prop:heading="The stockroom wouldn't open">
            {String(game.error)}
          </alert-banner>
        </Match>
        <Match when={game()}>{(ready) => <Stockroom game={ready()} />}</Match>
        <Match when={true}>
          <div class="waiting">
            <loading-spinner prop:label="Unlocking the stockroom" prop:inline={true} />
          </div>
        </Match>
      </Switch>
      <toast-region prop:position="bottom-end" prop:label="News from the store" prop:max={3} prop:duration={6000} />
    </main>
  );
}

function Stockroom(props: { game: Game }) {
  const game = props.game;
  const clock = game.clock;
  const [tab, setTab] = createSignal("stock");
  const [selected, setSelected] = createSignal<number[]>([]);
  const [each, setEach] = createSignal(6);
  const [over, setOver] = createSignal(false);
  const [again, setAgain] = createSignal(false);
  const [bestWorth, setBestWorth] = createSignal(best.read());
  const focus = createMemo(() => selected().at(-1) ?? null);

  // The month ends: say so once, and keep the best.
  const finished = createMemo(() => clock().phase !== PHASE.OPEN);
  createEffect(() => {
    if (!finished()) return;
    untrack(() => {
      if (clock().phase === PHASE.FINISHED && clock().worth > best.read()) best.write(clock().worth);
      setBestWorth(best.read());
      setOver(true);
    });
  });
  createEffect(() => game.watch(focus() ?? 0));

  const notice = createMemo((): { variant: "info" | "warning" | "danger"; heading: string; text: string } | null => {
    const c = clock();
    const rent = game.shape.rent;
    if (c.rentIn === 0 && c.cash < rent) return { variant: "danger", heading: "The rent comes out tonight", text: `You're ${money(rent - c.cash)} short. Sell something, or the month ends here.` };
    if (c.rentIn <= 1) return { variant: "warning", heading: c.rentIn === 0 ? "Rent comes out tonight" : "Rent comes out tomorrow night", text: `${money(rent)} from the register. Keep it there.` };
    if (c.rats >= 500 && c.traps * 30 < 50) return { variant: "warning", heading: "The rats are winning", text: "They're in the cardboard every night. Two traps hold them." };
    if (c.room <= 0) return { variant: "info", heading: "The shelves are full", text: "Nothing more fits on the shelves or the truck until something sells." };
    return null;
  });

  function orderSelected() {
    let ordered = 0;
    for (const id of selected()) if (game.buy(id, each(), true)) ordered++;
    if (ordered) toast(`${ordered} ${ordered === 1 ? "order is" : "orders are"} on the truck.`, "success");
  }
  function priceSelected(percent: number) {
    for (const id of selected()) game.price(id, nickel((game.detail(id).base * percent) / 100));
  }

  return (
    <>
      <Board game={game} />
      <Show when={notice()}>
        {(n) => (
          <alert-banner prop:variant={n().variant} prop:heading={n().heading}>
            {n().text}
          </alert-banner>
        )}
      </Show>
      <div class="controls">
        <segmented-control prop:label="Speed" prop:options={SPEEDS.map(({ value, label }) => ({ value, label }))} prop:value={game.speed()} prop:disabled={finished()} on:valuechange={(e: Event) => game.setSpeed(asEvent<string>(e))} />
        <p class="clock" role="timer" aria-label="The store's clock">
          <strong>Day {Math.min(clock().day + 1, game.shape.days)}</strong> of {game.shape.days} · {clockText(clock().hour)}
        </p>
        <action-button prop:variant="outline" prop:size="sm" on:click={() => (finished() ? game.restart(Math.floor(Math.random() * 1_000_000) + 1) : setAgain(true))}>
          New month
        </action-button>
      </div>

      <tab-list prop:label="The stockroom" prop:tabs={TABS} prop:value={tab()} on:valuechange={(e: Event) => setTab(asEvent<string>(e))}>
        <div data-tab="stock">
          <p class="quiet hint">
            Tick a part to work on it: order it, price it, or look at it. The last one you tick is the one on the <em>A part</em> tab. The columns move as the market does; sort by any of them.
          </p>
          <Show when={selected().length}>
            <div class="bulk" role="group" aria-label={`${selected().length} parts selected`}>
              <status-badge prop:variant="primary">{selected().length} selected</status-badge>
              <div class="field"><span class="cap">Each</span><quantity-stepper prop:label="Each" prop:min={1} prop:max={50} prop:editable={true} prop:value={each()} on:valuechange={(e: Event) => setEach(asEvent<number>(e))} /></div>
              <action-button prop:size="sm" prop:disabled={finished()} on:click={orderSelected}>
                Order {each()} of each
              </action-button>
              <segmented-control prop:label="Price them at (% of usual wholesale)" prop:options={MARKUPS} prop:value="" prop:disabled={finished()} on:valuechange={(e: Event) => priceSelected(Number(asEvent<string>(e)))} />
              <action-button prop:size="sm" prop:variant="outline" on:click={() => setTab("part")}>
                Look at it
              </action-button>
              <action-button prop:size="sm" prop:variant="ghost" on:click={() => setSelected([])}>
                Clear
              </action-button>
            </div>
          </Show>
          <data-table prop:label="Parts" prop:columns={COLUMNS} prop:rows={game.rows()} prop:selectable={true} prop:selected={selected()} prop:pageSize={0} prop:currency="USD" on:selectedchange={(e: Event) => setSelected(asEvent<number[]>(e))} />
        </div>

        <div data-tab="part">
          <Show
            when={focus() !== null}
            fallback={
              <empty-state prop:heading="No part picked">
                Tick a part on the Stock tab and it shows up here, with its price over the last two days and the dials to work it.
              </empty-state>
            }
          >
            <PartPanel game={game} id={focus()!} finished={finished()} />
          </Show>
        </div>

        <div data-tab="shelves">
          <Shelves game={game} />
        </div>

        <div data-tab="news">
          <Show when={game.news().length} fallback={<p class="quiet">Nothing has happened yet. It will.</p>}>
            <ul class="news" aria-label="What has happened, newest first">
              <For each={game.news()}>
                {(entry) => (
                  <li>
                    <status-badge prop:variant={entry.variant === "danger" ? "danger" : entry.variant === "warning" ? "warning" : entry.variant === "success" ? "success" : "neutral"}>Day {entry.day + 1}</status-badge>
                    <span>{entry.text}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>

        <div data-tab="hood">
          <Hood game={game} />
        </div>
      </tab-list>

      <modal-dialog prop:label="The month is over" prop:open={over()} on:openchange={(e: Event) => setOver(asEvent<boolean>(e))}>
        <span slot="heading">{clock().phase === PHASE.BROKE ? "The rent couldn't be paid" : "The month is over"}</span>
        <div class="result">
          <star-rating prop:readonly={true} prop:label="The month" prop:value={stars(clock().worth, game.startWorth(), clock().phase)} />
          <p>
            The store is worth <strong>{money(clock().worth)}</strong>, from {money(game.startWorth())} to start with.
          </p>
          <Show when={clock().phase === PHASE.FINISHED}>
            <p class="quiet">Best month on this device: {money(bestWorth())}. Seed {game.seed()}: play the same month again to try a different way through it.</p>
          </Show>
          <Show when={clock().phase === PHASE.BROKE}>
            <p class="quiet">The register was short on rent day. Seed {game.seed()}: the same month is waiting if you want another go.</p>
          </Show>
        </div>
        <action-button slot="actions" prop:variant="outline" data-close on:click={() => game.restart(game.seed())}>
          The same month again
        </action-button>
        <action-button slot="actions" data-close on:click={() => game.restart(Math.floor(Math.random() * 1_000_000) + 1)}>
          A new month
        </action-button>
      </modal-dialog>

      <modal-dialog prop:label="Start over?" prop:open={again()} on:openchange={(e: Event) => setAgain(asEvent<boolean>(e))}>
        <span slot="heading">Start a new month?</span>
        <p>This month isn't finished. A new one starts from day 1 with a fresh market.</p>
        <action-button slot="actions" prop:variant="outline" data-close>
          Keep going
        </action-button>
        <action-button slot="actions" data-close on:click={() => game.restart(Math.floor(Math.random() * 1_000_000) + 1)}>
          New month
        </action-button>
      </modal-dialog>
    </>
  );
}

/** What the store has: cash and worth, the clock's days, the weather, the rent, and the three things that fill up. */
function Board(props: { game: Game }) {
  const { game } = props;
  const clock = game.clock;
  const rentWords = () => (clock().rentIn === 0 ? "tonight" : clock().rentIn === 1 ? "tomorrow night" : `in ${clock().rentIn} days`);
  const growth = () => Math.round((clock().worth / Math.max(1, game.startWorth()) - 1) * 100);
  const weather = () => (clock().temp <= 25 ? "bitter" : clock().temp <= 40 ? "cold" : clock().temp <= 60 ? "cool" : "mild");
  return (
    <section class="board" aria-label="The store">
      <auto-grid prop:min="10rem" prop:gap="0.75rem">
        <div class="tile cash">
          <span class="label">Cash</span>
          <number-ticker class="big" prop:value={clock().cash / 100} prop:prefix="$" prop:decimals={0} prop:duration={250} />
          <span class="foot">in the register</span>
        </div>
        <stat-card prop:label="The store is worth" prop:value={dollars(clock().worth)} prop:change={growth()} prop:good="up" prop:period="since day 1" />
        <stat-card prop:label="Rent" prop:value={dollars(game.shape.rent)} prop:period={rentWords()} />
        <stat-card prop:label="Outside" prop:value={`${clock().temp}°F`} prop:period={weather()} />
        <div class="tile">
          <progress-bar prop:label="Shelves and truck" prop:value={clock().stock + clock().truck} prop:max={game.shape.shelf} prop:showValue={true} />
          <span class="foot">
            {clock().stock} on the shelves · {clock().truck} on the truck
          </span>
        </div>
        <div class="tile">
          <progress-bar prop:label="The store's name" prop:value={clock().rep} prop:max={1000} prop:showValue={true} />
          <span class="foot">{clock().missedToday ? `${clock().missedToday} sent away today` : "nobody sent away today"}</span>
        </div>
        <div class="tile rats">
          <progress-bar prop:label="Rats" prop:value={clock().rats} prop:max={1000} prop:showValue={true} />
          <action-button prop:size="sm" prop:variant="outline" prop:disabled={clock().phase !== PHASE.OPEN} on:click={() => game.trap()}>
            Set a trap · {money(game.shape.trapCost)} · {clock().traps} set
          </action-button>
        </div>
      </auto-grid>
    </section>
  );
}

/** One part, close up: its price over two days, the numbers, and the dials. */
function PartPanel(props: { game: Game; id: number; finished: boolean }) {
  const { game } = props;
  // `rows` changes whenever the sim moves, so reading it here makes the panel follow the sim.
  const d = createMemo(() => (game.rows(), game.detail(props.id)));
  const name = () => PARTS[props.id];
  const shelf = () => SHELVES[Math.floor(props.id / 6)];
  const vsUsual = () => Math.round((d().cost / d().base - 1) * 100);
  const margin = () => Math.round(((d().price - d().cost) / d().price) * 100);

  // The slider keeps its own place while it is being dragged; it takes the sim's price back when the part changes or a button sets prices.
  const [percent, setPercent] = createSignal(150);
  createEffect(on([() => props.id, game.priced], () => setPercent(Math.round((untrack(d).price * 100) / untrack(d).base))));
  const [qty, setQty] = createSignal(10);
  const on_ = () => d().to > 0;
  const standing = () => {
    const per = perDay(d().rate, game.shape.demandPercent);
    const below = Math.max(2, Math.ceil(per * 0.75));
    return { below, to: Math.max(below + 3, Math.ceil(per * 2) + 2) };
  };

  return (
    <div class="part">
      <div class="head">
        <h2>{name()}</h2>
        <status-badge prop:variant="outline">{shelf()}</status-badge>
        <status-badge prop:variant={vsUsual() >= 10 ? "danger" : vsUsual() <= -10 ? "success" : "neutral"} prop:dot={true}>
          {vsUsual() === 0 ? "wholesale is usual" : `wholesale ${vsUsual() > 0 ? "+" : "−"}${Math.abs(vsUsual())}% on usual`}
        </status-badge>
      </div>

      <line-chart prop:label={`${name()}, wholesale, last 48 hours`} prop:points={game.chart()} />

      <auto-grid prop:min="9rem" prop:gap="0.75rem">
        <stat-card prop:label="Wholesale" prop:value={money(d().cost)} prop:change={vsUsual()} prop:good="down" prop:period="vs usual" />
        <stat-card prop:label="On the shelf at" prop:value={money(d().price)} prop:period={`${margin()}% margin`} />
        <stat-card prop:label="In stock" prop:value={String(d().stock)} prop:period={`${d().truck} on the truck`} />
        <stat-card prop:label="Sold today" prop:value={String(d().soldToday)} prop:period={`${d().sold} this month · ${d().missed} sent away`} />
      </auto-grid>

      <range-slider
        class="wide"
        prop:label="Shelf price"
        prop:unit="% of usual wholesale"
        prop:min={100}
        prop:max={260}
        prop:step={5}
        prop:value={percent()}
        prop:disabled={props.finished}
        on:valuechange={(e: Event) => {
          const value = asEvent<number>(e);
          setPercent(value);
          game.price(props.id, nickel((d().base * value) / 100), true);
        }}
      />

      <div class="row">
        <div class="field"><span class="cap">Order</span><quantity-stepper prop:label="Order" prop:min={1} prop:max={99} prop:editable={true} prop:value={qty()} on:valuechange={(e: Event) => setQty(asEvent<number>(e))} /></div>
        <action-button prop:disabled={props.finished} on:click={() => game.buy(props.id, qty())}>
          Order {qty()} for {money(qty() * d().cost)}
        </action-button>
      </div>

      <div class="row standing">
        <toggle-switch
          prop:label="Standing order"
          prop:description="Orders more by itself when it runs low."
          prop:checked={on_()}
          prop:disabled={props.finished}
          on:checkedchange={(e: Event) => {
            const wanted = asEvent<boolean>(e);
            if (wanted === on_()) return;
            const { below, to } = standing();
            game.auto(props.id, wanted ? below : 0, wanted ? to : 0);
          }}
        />
        <Show when={on_()}>
          <div class="field"><span class="cap">When under</span>
          <quantity-stepper
            prop:label="When under"
            prop:min={0}
            prop:max={98}
            prop:editable={true}
            prop:value={d().below}
            on:valuechange={(e: Event) => {
              const below = asEvent<number>(e);
              if (below !== d().below) game.auto(props.id, below, Math.max(d().to, below));
            }}
          />
          </div>
          <div class="field"><span class="cap">Top up to</span>
          <quantity-stepper
            prop:label="Top up to"
            prop:min={1}
            prop:max={99}
            prop:editable={true}
            prop:value={d().to}
            on:valuechange={(e: Event) => {
              const to = asEvent<number>(e);
              if (to !== d().to) game.auto(props.id, Math.min(d().below, to), to);
            }}
          />
          </div>
        </Show>
      </div>
    </div>
  );
}

/** The eight shelves: what sold today, what wholesale is doing to each, and one dial to price a whole shelf. */
function Shelves(props: { game: Game }) {
  const { game } = props;
  const [chosen, setChosen] = createSignal<Record<number, string>>({});
  return (
    <div class="shelves">
      <bar-chart prop:label="Sold today, by shelf" prop:items={SHELVES.map((label, i) => ({ label, value: game.sales()[i] ?? 0 }))} prop:unit=" sold" />
      <auto-grid prop:min="15rem" prop:gap="0.75rem">
        <For each={game.trends()}>
          {(trend) => (
            <content-card prop:heading={SHELVES[trend.shelf]}>
              <div class="shelf">
                <div class="line">
                  <status-badge prop:variant={trend.change >= 10 ? "danger" : trend.change <= -8 ? "success" : "neutral"} prop:dot={true}>
                    {trend.change === 0 ? "usual" : `${trend.change > 0 ? "+" : "−"}${Math.abs(trend.change)}%`}
                  </status-badge>
                  <span class="quiet">wholesale, two days</span>
                </div>
                <spark-line prop:label={`${SHELVES[trend.shelf]} wholesale prices`} prop:points={trend.points} />
              </div>
              <segmented-control
                slot="footer"
                prop:label="Price the shelf at (% of usual wholesale)"
                prop:options={MARKUPS}
                prop:value={chosen()[trend.shelf] ?? ""}
                on:valuechange={(e: Event) => {
                  const value = asEvent<string>(e);
                  if (game.markup(trend.shelf, Number(value))) setChosen((c) => ({ ...c, [trend.shelf]: value }));
                }}
              />
            </content-card>
          )}
        </For>
      </auto-grid>
    </div>
  );
}

/** How Zubra is holding up: what the page asks of it, and what it costs. */
function Hood(props: { game: Game }) {
  const { game } = props;
  const m = game.meter;
  const budget = () => Math.min(100, Math.round(((m().publishMs + m().stepMs) / 16.7) * 100));
  return (
    <div class="hood">
      <p class="quiet">
        Every frame the sim runs its tics and this page reads the new numbers out of WebAssembly's memory. Setting them is when Zubra starts work: 48 table rows, the tickers, the bars. These are measured live. Run it at 64× and
        change how often the screen is given new numbers to see what Zubra costs.
      </p>
      <segmented-control prop:label="Give the screen new numbers" prop:options={REDRAW_OPTIONS} prop:value={game.redraw()} on:valuechange={(e: Event) => game.setRedraw(asEvent<Redraw>(e))} />
      <auto-grid prop:min="9rem" prop:gap="0.75rem">
        <stat-card prop:label="Tics a second" prop:value={String(m().tics)} prop:period="sim, in wasm" />
        <stat-card prop:label="Screen updates a second" prop:value={String(m().updates)} prop:period={REDRAWS[game.redraw()] ? `capped at ${1000 / REDRAWS[game.redraw()]}` : "up to one a frame"} />
        <stat-card prop:label="Sim, per frame" prop:value={`${m().stepMs.toFixed(2)} ms`} prop:period="running the tics" />
        <stat-card prop:label="Page, per update" prop:value={`${m().publishMs.toFixed(2)} ms`} prop:period="reading them, setting signals" />
        <stat-card prop:label="Slowest frame" prop:value={`${m().frameMs} ms`} prop:period="in the last second" />
        <stat-card prop:label="Zubra elements" prop:value={String(m().components)} prop:period={`of ${m().elements} on the page`} />
        <stat-card prop:label="Sim memory" prop:value={`${m().memoryKb} KB`} prop:period="the whole store, in place" />
      </auto-grid>
      <progress-bar prop:label="Share of a 60 fps frame spent on the sim and the page's own work" prop:value={budget()} prop:max={100} prop:showValue={true} />
    </div>
  );
}
