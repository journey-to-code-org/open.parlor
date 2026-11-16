// Road to the Shootout (`pinkslips` in code): the garage, and the way out of it to the strip. The garage is the engine's
// (`pinkslipsgarage` in open.games), kept in this browser: the cash, the cars, and today's
// classifieds, which change with the day on this device.
//
// What there is to do: buy something tired, fix it, bolt parts on it, and take it to the line,
// alone against the clock or against one of the locals for money. What a run did to the car comes
// back with it.
import {
  CAR_MODELS, GARAGE_STAKE, MOUNTAIN_ROAD_PRESETS, PINKSLIPS_PRESETS, afterRace, carValue, garageAct, garageView, loadGarage, mountainRoad, newDay, newGarage, pinkSlips, safeBuild, settleUp, timeslip,
  type Build, type GarageState, type GarageView,
} from "@journey-to-code/games";
import type { PlayStyle } from "@journey-to-code/rules";
import { useMemo, useState } from "react";
import { blip, notes, wakeArcadeSound } from "../arcade/sounds";
import { loadDrive, loadDriveStrip, saveDrive, saveDriveStrip } from "../storage";
import { Road, type RoadOutcome } from "./Road";
import { Strip, type Rival, type StripOutcome } from "./Strip";

const today = () => {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
};
const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;
const seconds = (ms: number) => (ms / 1000).toFixed(2);
const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);

function openGarage(): GarageState {
  const g = loadGarage(loadDrive()) ?? newGarage(Math.floor(Math.random() * 2 ** 31), today());
  newDay(g, today());
  return g;
}

// ---- The locals ------------------------------------------------------------------------------------
// Who there is to race when nobody else is about: three of them, picked to suit the car you bring.
// One you should beat, one that is a race, and one that should beat you, for more money each time.

type Local = Rival & { kind: string; pitch: string; et: number; car: string };
const DRIVERS = ["Lenny", "Big Deb", "Scooter", "Mrs. Okafor", "Two-Tone", "The Kid", "Wrench", "Sunday Dave", "Marge", "Cousin Ray", "Lucky", "Doc"];
let field: { build: Build; et: number }[] | null = null;
/** Every car there is at four states of tune, with what each runs. Worked out once. */
function everyone() {
  if (!field) {
    field = [];
    CAR_MODELS.forEach((_, model) => {
      for (let level = 0; level <= 3; level++) {
        const build = safeBuild([model, level, level, level, level, level, level, Math.min(2, level), 1, 850, 800]);
        const run = timeslip(build);
        if (run.finished) field!.push({ build, et: run.et });
      }
    });
  }
  return field;
}
function localsFor(mine: Build, value: number, day: number): Local[] {
  const et = timeslip(mine).et;
  if (!et) return [];
  const kinds: [kind: string, pitch: string, gap: number, share: number, style: PlayStyle][] = [
    ["Easy money", "Slower than you, and not much of a driver.", 900, 5, { skill: 0.3, sloppy: 0.25 }],
    ["A race", "About what you run. It comes down to the light.", 150, 12, { skill: 0.65, sloppy: 0.06 }],
    ["A long shot", "Quicker than you and knows it. Leave first or lose.", -600, 30, { skill: 1, sloppy: 0 }],
  ];
  const taken = new Set<number>();
  return kinds.map(([kind, pitch, gap, share, style], i) => {
    const pool = everyone().map((e, n) => ({ ...e, n })).filter((e) => !taken.has(e.n));
    const pick = pool.reduce((best, e) => (Math.abs(e.et - (et + gap)) < Math.abs(best.et - (et + gap)) ? e : best));
    taken.add(pick.n);
    return { kind, pitch, name: DRIVERS[(day * 3 + i * 5 + pick.n) % DRIVERS.length]!, build: pick.build, style, stake: round10((value * share) / 100), et: pick.et, car: CAR_MODELS[pick.build[0]!]!.name };
  });
}

type Racing = { car: number; carName: string; build: Build; rival: Rival | null; key: number; road: boolean };

export function PinkSlips({ onHome }: { onHome: () => void }) {
  const [garage, setGarage] = useState(openGarage);
  const [picked, setPicked] = useState<number | null>(() => garage.cars[0]?.id ?? null);
  const [tab, setTab] = useState<"car" | "ads">(() => (garage.cars.length ? "car" : "ads"));
  const [toast, setToast] = useState<{ text: string; ok: boolean; key: number } | null>(null);
  const [strip, setStrip] = useState(loadDriveStrip);
  const [racing, setRacing] = useState<Racing | null>(null);
  const [route, setRoute] = useState("sunday");
  const [naming, setNaming] = useState<string | null>(null);

  const view: GarageView = useMemo(() => garageView(garage), [garage]);
  const car = view.cars.find((c) => c.id === picked) ?? view.cars[0] ?? null;
  const rules = pinkSlips.normalize({ id: strip });
  const locals = useMemo(() => (car?.runs ? localsFor(car.build, car.value, garage.day) : []), [car?.id, car?.value, car?.runs, garage.day]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Change the garage, keep it, and say what happened. */
  const change = (work: (g: GarageState) => { ok: boolean; message: string } | void) => {
    wakeArcadeSound();
    const next = structuredClone(garage);
    const said = work(next);
    setGarage(next);
    saveDrive(next);
    if (said) {
      setToast({ text: said.message, ok: said.ok, key: Date.now() });
      if (said.ok) notes([523, 784], 70, 0.1);
      else blip(160, 0.18, "sawtooth", 0.05);
    }
    return next;
  };
  const act = (command: Record<string, unknown>) => change((g) => garageAct(g, command));

  const race = (rival: Rival | null, road = false) => {
    if (!car) return;
    wakeArcadeSound();
    saveDriveStrip(strip);
    setRacing({ car: car.id, carName: car.name, build: car.build, rival, key: Date.now(), road });
  };
  /** Back from the mountain: the wear, the fines, the bodywork, and the bet if there was one. */
  const downFromTheMountain = (outcome: RoadOutcome | null) => {
    const was = racing;
    setRacing(null);
    if (!was || !outcome) return;
    change((g) => {
      const stake = was.rival?.stake ?? 0;
      const won = !!was.rival && outcome.mine.won;
      const lost = !!was.rival && (outcome.forfeit || !!outcome.theirs?.won);
      const owned = g.cars.find((c) => c.id === was.car);
      // Bodywork is four tenths of the car for a wreck, and less for less.
      const body = owned ? Math.round((carValue(owned) * outcome.mine.damage * 4) / 10_000 / 10) * 10 : 0;
      afterRace(g, was.car, { ...outcome.mine, won });
      settleUp(g, (won ? stake : lost ? -stake : 0) - outcome.mine.fines - body);
      const bills = [outcome.mine.fines ? `${dollars(outcome.mine.fines)} in fines` : "", body ? `${dollars(body)} of bodywork` : ""].filter(Boolean).join(" and ");
      return { ok: won || (!was.rival && outcome.mine.out === "finished"), message: `${won ? `${was.rival!.name} pays up: ${dollars(stake)}. ` : lost ? `${was.rival!.name} takes ${dollars(stake)}. ` : ""}${bills ? `It cost you ${bills}.` : outcome.mine.out === "finished" ? "Home without a scratch." : "Nothing to pay."}` };
    });
  };
  const home = (outcome: StripOutcome | null) => {
    const was = racing;
    setRacing(null);
    if (!was || !outcome) return;
    change((g) => {
      const stake = was.rival?.stake ?? 0;
      const won = !!was.rival && outcome.mine.won;
      const push = !!was.rival && !outcome.forfeit && !won && !outcome.theirs?.won;
      // A pass alone is practice: it wears the car, and is nobody's win.
      afterRace(g, was.car, { ...outcome.mine, won });
      if (stake && !push) settleUp(g, won ? stake : -stake);
      if (!was.rival) return;
      return { ok: won, message: won ? `${was.rival.name} pays up: ${dollars(stake)}.` : push ? "No clean run from either lane. Stakes back." : outcome.forfeit ? `You walked. ${was.rival.name} keeps ${dollars(stake)}.` : `${was.rival.name} takes ${dollars(stake)}.` };
    });
  };

  if (racing?.road) return <Road key={racing.key} rules={mountainRoad.normalize({ id: route })} build={racing.build} carName={racing.carName} rival={racing.rival} onDone={downFromTheMountain} />;
  if (racing) return <Strip key={racing.key} rules={rules} build={racing.build} carName={racing.carName} rival={racing.rival} onDone={home} />;

  const cheapest = Math.min(...view.listings.map((l) => l.price));
  const broke = view.cars.length === 0 && view.cash < cheapest;

  return (
    <div className="pinks">
      <header className="pinks-top">
        <button type="button" className="pinks-back" onClick={onHome}>← Games</button>
        <h1>🏁 Road to the Shootout</h1>
        <div className="pinks-till">
          <div><small>Cash</small><b className="cash">{dollars(view.cash)}</b></div>
          <div><small>Races</small><b>{view.record.wins} of {view.record.races}</b></div>
        </div>
      </header>

      <div className="pinks-floor">
        <nav className="pinks-bays" aria-label="Your cars">
          <h2>The garage <small>{view.cars.length} of {view.bays} bays</small></h2>
          {view.cars.map((c) => (
            <button key={c.id} type="button" className={c.id === car?.id && tab === "car" ? "bay on" : "bay"} onClick={() => { setPicked(c.id); setTab("car"); }}>
              <b>{c.name}</b>
              <span>{c.runs ? (c.sheet.quarter ? `${seconds(c.sheet.quarter.et)} s · ${c.sheet.horsepower} hp` : `${c.sheet.horsepower} hp`) : "Blown engine"}</span>
            </button>
          ))}
          {view.cars.length === 0 && <p className="empty">Nothing in here but an oil stain. The classifieds are where it starts.</p>}
          <button type="button" className={tab === "ads" ? "bay ads on" : "bay ads"} onClick={() => setTab("ads")}>
            <b>Classifieds</b>
            <span>{view.listings.length} for sale today</span>
          </button>
        </nav>

        {tab === "ads" || !car ? (
          <section className="pinks-ads" aria-label="Classifieds">
            <h2>Classifieds <small>New ones tomorrow</small></h2>
            {broke && (
              <div className="pinks-card cousin">
                <p>No car and not enough for one. Your cousin will front you the money for a shitbox, this once more.</p>
                <button type="button" className="yes" onClick={() => change((g) => { settleUp(g, Math.max(GARAGE_STAKE / 2, cheapest) - g.cash); return { ok: true, message: "Don't make him regret it." }; })}>Take it</button>
              </div>
            )}
            <ul>
              {view.listings.map((l) => (
                <li key={l.id} className={`pinks-card tier${CAR_MODELS.find((m) => m.name === l.sheet.model)?.tier ?? 0}`}>
                  <div className="row"><b>{l.sheet.year} {l.sheet.model}</b><b className="cash">{dollars(l.price)}</b></div>
                  <p className="pitch">“{l.pitch}”</p>
                  <p className="facts">{l.sheet.tier} · {l.sheet.horsepower} hp · {l.sheet.drive} · {l.sheet.gearbox}{l.sheet.quarter ? ` · runs ${seconds(l.sheet.quarter.et)}` : " · does not run"}</p>
                  <Wear label="Engine" value={l.engine} />
                  <Wear label="Tyres" value={l.rubber} />
                  <button type="button" className="yes" disabled={!l.can} onClick={() => { const g = act({ cmd: "buy", listing: l.id }); const mine = g.cars.at(-1); if (mine && g.cars.length > garage.cars.length) { setPicked(mine.id); setTab("car"); } }}>{l.can ? "Buy it" : view.cars.length >= view.bays ? "No room" : "Can't afford it"}</button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="pinks-car" aria-label={car.name}>
            <div className="pinks-card">
              <div className="row">
                {naming === null ? (
                  <h2>{car.name} <button type="button" className="fine" onClick={() => setNaming(car.name)}>Rename</button></h2>
                ) : (
                  <form className="row" onSubmit={(e) => { e.preventDefault(); act({ cmd: "name", car: car.id, name: naming }); setNaming(null); }}>
                    <input value={naming} maxLength={28} autoFocus onChange={(e) => setNaming(e.target.value)} aria-label="The car's name" />
                    <button type="submit" className="yes">Save</button>
                  </form>
                )}
                <span className="worth">Worth {dollars(car.value)}</span>
              </div>
              <p className="facts">{car.sheet.year} {car.sheet.model} · {car.sheet.tier} · {car.sheet.drive} · {car.sheet.gearbox} · {car.sheet.mass} kg</p>
              <div className="pinks-numbers">
                <div><small>Power</small><b>{car.sheet.horsepower} hp</b></div>
                <div><small>Quarter mile</small><b>{car.sheet.quarter ? `${seconds(car.sheet.quarter.et)} s` : "—"}</b></div>
                <div><small>At the line</small><b>{car.sheet.quarter ? `${car.sheet.quarter.mph} mph` : "—"}</b></div>
                <div><small>Record</small><b>{car.wins} of {car.races}</b></div>
              </div>
              <Wear label="Engine" value={car.engine}>{car.repairs.engine > 0 && <button type="button" disabled={view.cash < car.repairs.engine} onClick={() => act({ cmd: "engine", car: car.id })}>Rebuild {dollars(car.repairs.engine)}</button>}</Wear>
              <Wear label="Tyres" value={car.rubber}>{car.repairs.tyres > 0 && <button type="button" disabled={view.cash < car.repairs.tyres} onClick={() => act({ cmd: "tyres", car: car.id })}>New set {dollars(car.repairs.tyres)}</button>}</Wear>
            </div>

            <div className="pinks-card">
              <h3>Parts</h3>
              <ul className="pinks-parts">
                {car.parts.map((p) => (
                  <li key={p.slot}>
                    <div><b>{p.label}</b> <span className="has">{p.has}</span><small>{p.hint}</small></div>
                    {p.next ? <button type="button" disabled={!p.next.can} onClick={() => act({ cmd: "fit", car: car.id, slot: p.slot, level: p.next!.level })}>{p.next.label}<i>{dollars(p.next.cost)}</i></button> : <span className="maxed">Maxed</span>}
                  </li>
                ))}
                <li>
                  <div><b>Final drive</b><small>Shorter leaves harder and runs out sooner. Free to change.</small></div>
                  <span className="pinks-final">{["Tall", "Stock", "Short"].map((name, i) => <button key={name} type="button" className={car.final === i ? "on" : ""} onClick={() => act({ cmd: "final", car: car.id, final: i })}>{name}</button>)}</span>
                </li>
              </ul>
            </div>

            <div className="pinks-card">
              <div className="row">
                <h3>Tonight</h3>
                <label className="pinks-where">Where <select value={strip} onChange={(e) => setStrip(e.target.value)}>{PINKSLIPS_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              </div>
              <p className="facts">{pinkSlips.describe(rules).slice(0, 2).join(" ")}</p>
              {car.runs ? (
                <ul className="pinks-locals">
                  <li>
                    <div><b>Test and tune</b><small>A pass alone against the clock. Nothing riding on it but the wear.</small></div>
                    <button type="button" className="yes" onClick={() => race(null)}>Make a pass</button>
                  </li>
                  {locals.map((l) => (
                    <li key={l.kind}>
                      <div><b>{l.kind}: {l.name}</b> <span className="has">{l.car}, runs about {seconds(l.et)}</span><small>{l.pitch}</small></div>
                      <button type="button" className="yes" disabled={view.cash < l.stake} onClick={() => race(l)}>Race for {dollars(l.stake)}</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="bad">It will not start. The engine needs a rebuild first.</p>
              )}
            </div>

            {car.runs && (
              <div className="pinks-card">
                <div className="row">
                  <h3>The mountain road</h3>
                  <label className="pinks-where">Which run <select value={route} onChange={(e) => setRoute(e.target.value)}>{MOUNTAIN_ROAD_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                </div>
                <p className="facts">{mountainRoad.describe(mountainRoad.normalize({ id: route }))[0]} Fines and bodywork come out of your cash when you get back.</p>
                <ul className="pinks-locals">
                  <li>
                    <div><b>Take it out</b><small>The road, the traffic and the law. Nobody to beat but the clock.</small></div>
                    <button type="button" className="yes" onClick={() => race(null, true)}>Drive</button>
                  </li>
                  {locals[1] && (
                    <li>
                      <div><b>Run it against {locals[1].name}</b> <span className="has">{locals[1].car}</span><small>Same road, same traffic. First to the far end.</small></div>
                      <button type="button" className="yes" disabled={view.cash < locals[1].stake} onClick={() => race(locals[1]!, true)}>Race for {dollars(locals[1].stake)}</button>
                    </li>
                  )}
                </ul>
              </div>
            )}

            <button type="button" className="pinks-sell" onClick={() => { if (window.confirm(`Sell ${car.name} to the dealer for ${dollars(car.sells)}?`)) { act({ cmd: "sell", car: car.id }); setPicked(null); } }}>Sell to the dealer for {dollars(car.sells)}</button>
          </section>
        )}

        <aside className="pinks-how">
          <h2>How it goes</h2>
          <ol>
            <li>Hold the revs up in neutral while you wait.</li>
            <li>On the green, shift into first. Before the green is a red light, and you lose.</li>
            <li>Shift up when the light by the tach comes on. Past the redline the engine cooks.</li>
            <li>If the tyres spin, lift a little.</li>
          </ol>
          <h3>Keys</h3>
          <p><kbd>W</kbd> or <kbd>↑</kbd> throttle · <kbd>S</kbd> or <kbd>↓</kbd> half throttle · <kbd>Space</kbd> or <kbd>D</kbd> shift up · <kbd>A</kbd> shift down · <kbd>C</kbd> get in or step back</p>
          <p>On the road: <kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> steer · <kbd>W</kbd> throttle · <kbd>S</kbd> brake · <kbd>E</kbd> shift up · <kbd>Q</kbd> shift down</p>
          <p className="facts">On a phone there is a pedal and a shifter on the screen. Slide your thumb down the pedal to lift.</p>
        </aside>
      </div>

      {toast && <div className={toast.ok ? "pinks-toast" : "pinks-toast no"} key={toast.key} role="status">{toast.text}</div>}
    </div>
  );
}

function Wear({ label, value, children }: { label: string; value: number; children?: React.ReactNode }) {
  const tone = value === 0 ? "dead" : value < 350 ? "low" : value < 700 ? "mid" : "good";
  return (
    <div className="pinks-wear">
      <span>{label}</span>
      <div className={`bar ${tone}`}><i style={{ width: `${value / 10}%` }} /></div>
      <em>{value === 0 ? "Blown" : `${Math.round(value / 10)}%`}</em>
      {children}
    </div>
  );
}

