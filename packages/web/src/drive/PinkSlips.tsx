// Road to the Shootout (`pinkslips` in code): the garage, and the way out of it to the strip. The garage is the engine's
// (`pinkslipsgarage` in open.games), kept in this browser: the cash, the cars, and today's
// classifieds, which change with the day on this device.
//
// What there is to do: buy something tired, fix it, bolt parts on it, and take it to the line,
// alone against the clock or against one of the locals for money. What a run did to the car comes
// back with it.
//
// It is a place, not a list: you stand in the garage and pick the thing you mean (the paper on the
// bench, the hood, the door), and a part comes off by undoing its bolts. The pictures are in `Scenes`.
import {
  CAR_MODELS, DYNO_COST, GARAGE_STAKE, MOUNTAIN_ROAD_PRESETS, REMOTE_TUNE_COST, PINKSLIPS_PRESETS, afterRace, carValue, garageAct, garageView, loadGarage, mountainRoad, newDay, newGarage, pinkSlips, safeBuild, settleUp, timeslip,
  type Build, type GarageState, type GarageView,
} from "@journey-to-code/games";
import type { PlayStyle } from "@journey-to-code/rules";
import { useEffect, useMemo, useRef, useState } from "react";
import { blip, notes, wakeArcadeSound } from "../arcade/sounds";
import { loadDrive, loadDriveHouse, loadDriveStrip, loadMyHouses, saveDrive, saveDriveHouse, saveDriveStrip } from "../storage";
import { fetchGarage, fetchGarages, fetchMarket, marketDo, sendGarage, type HouseGarage, type MarketLook } from "./house";
import { Road, type RoadOutcome } from "./Road";
import { EngineBay, GarageScene, Junction, Lot, SideView, paintOf } from "./Scenes";
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

/** What each kind of piece is called when the talk is of the market for them: a gearbox off a car is not a gearbox upgrade. */
const KINDS: Record<string, string> = { intake: "intakes", exhaust: "exhausts", cam: "cams", boost: "boost parts", tyres: "tyre upgrades", weight: "weight parts", trans: "gearbox upgrades", block: "engines", gearbox: "gearboxes", panels: "body panels", interior: "interiors", wheels: "wheels", glass: "glass" };

type Place = "garage" | "hood" | "under" | "body" | "paper" | "laptop" | "tools" | "shelf" | "board" | "manual" | "out";
const PLACES: Record<Place, string> = { garage: "The garage", hood: "Under the hood", under: "Up on stands", body: "The car", paper: "The paper", laptop: "The laptop", tools: "The tool wall", shelf: "Your shelf", board: "The board", manual: "The manual", out: "Out the door" };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

type Racing = { car: number; carName: string; build: Build; rival: Rival | null; key: number; road: boolean; tune: boolean };

export function PinkSlips({ onHome }: { onHome: () => void }) {
  const [garage, setGarage] = useState(openGarage);
  const [picked, setPicked] = useState<number | null>(() => garage.cars[0]?.id ?? null);
  // Where you are standing, and what you have picked there.
  const [place, setPlace] = useState<Place>(() => (garage.cars.length ? "garage" : "paper"));
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [job, setJob] = useState<{ spot: string; label: string; left: number[]; run: () => void } | null>(null);
  const [pulled, setPulled] = useState(0);
  const [site, setSite] = useState<"rix" | "speed">("rix");
  // The house this garage is kept in: sent there after every change, and where the trading is.
  const [house, setHouse] = useState(loadDriveHouse);
  const houseRef = useRef(house);
  houseRef.current = house;
  const garageRef = useRef(garage);
  garageRef.current = garage;
  const [market, setMarket] = useState<MarketLook | null>(null);
  const [club, setClub] = useState<HouseGarage[]>([]);
  const myHouses = loadMyHouses();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const keepHouse = (next: { slug: string; name: string; rev: number } | null) => {
    saveDriveHouse(next);
    houseRef.current = next;
    setHouse(next);
  };
  /** Take up the house's copy in place of the one here. */
  const adopt = (state: unknown, rev: number) => {
    const theirs = loadGarage(state);
    const at = houseRef.current;
    if (!theirs || !at) return;
    newDay(theirs, today());
    garageRef.current = theirs;
    setGarage(theirs);
    saveDrive(theirs);
    keepHouse({ ...at, rev });
  };
  /** Send the garage to its house, one save at a time; take the house's up instead when that one is newer. */
  const push = () => {
    queue.current = queue.current.then(async () => {
      const at = houseRef.current;
      if (!at) return;
      const sent = await sendGarage(at.slug, garageRef.current, at.rev);
      if (houseRef.current?.slug !== at.slug) return;
      if (sent.kind === "saved") keepHouse({ ...at, rev: sent.rev });
      else if (sent.kind === "newer") adopt(sent.state, sent.rev);
      else if (sent.kind === "gone") keepHouse(null);
    });
    return queue.current;
  };
  const lookAround = () => {
    const at = houseRef.current;
    if (!at) return;
    void fetchMarket(at.slug).then((look) => look && houseRef.current?.slug === at.slug && setMarket(look));
    void fetchGarages(at.slug).then((all) => houseRef.current?.slug === at.slug && setClub(all));
  };
  useEffect(() => {
    if (!house) {
      setMarket(null);
      setClub([]);
      return;
    }
    // On opening, the house's copy is taken up if it was changed somewhere else since this browser last agreed with it.
    void fetchGarage(house.slug).then((theirs) => {
      if (!theirs || houseRef.current?.slug !== house.slug) return;
      if (theirs.state && theirs.rev !== house.rev) adopt(theirs.state, theirs.rev);
      else if (!theirs.state) void push();
      lookAround();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house?.slug]);
  const [toast, setToast] = useState<{ text: string; ok: boolean; key: number } | null>(null);
  const [strip, setStrip] = useState(loadDriveStrip);
  const [racing, setRacing] = useState<Racing | null>(null);
  const [route, setRoute] = useState("sunday");
  const [naming, setNaming] = useState<string | null>(null);

  const view: GarageView = useMemo(() => garageView(garage), [garage]);
  const tools = garage.tools;
  const car = view.cars.find((c) => c.id === picked) ?? view.cars[0] ?? null;
  const rules = pinkSlips.normalize({ id: strip });
  const locals = useMemo(() => (car?.runs ? localsFor(car.build, car.value, garage.day) : []), [car?.id, car?.value, car?.runs, garage.day]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Change the garage, keep it, and say what happened. */
  const change = (work: (g: GarageState) => { ok: boolean; message: string } | void) => {
    wakeArcadeSound();
    const next = structuredClone(garage);
    const said = work(next);
    garageRef.current = next;
    setGarage(next);
    saveDrive(next);
    void push();
    if (said) {
      setToast({ text: said.message, ok: said.ok, key: Date.now() });
      if (said.ok) notes([523, 784], 70, 0.1);
      else blip(160, 0.18, "sawtooth", 0.05);
    }
    return next;
  };
  const act = (command: Record<string, unknown>) => change((g) => garageAct(g, command));
  const say = (text: string, ok = false) => setToast({ text, ok, key: Date.now() });
  /** Put the garage in a house: straight in when the house has none of this player's, a choice when it has. */
  const moveIn = async (slug: string) => {
    const chosen = myHouses.find((h) => h.slug === slug);
    if (!chosen) return;
    const theirs = await fetchGarage(slug);
    if (!theirs) return say("That house can't be reached just now.");
    keepHouse({ ...chosen, rev: theirs.rev });
    if (theirs.state && window.confirm(`${chosen.name} already keeps a garage of yours. Use that one? (Cancel puts this browser's garage there in its place.)`)) adopt(theirs.state, theirs.rev);
    else await push();
    lookAround();
  };
  /** Something done in the house's market: the garage is sent first, and comes back as it now stands. */
  const trade = async (input: Record<string, unknown>, done: (d: Awaited<ReturnType<typeof marketDo>>) => string) => {
    await push();
    const at = houseRef.current;
    if (!at) return;
    const d = await marketDo(at.slug, { ...input, rev: at.rev });
    if (d.state !== undefined && d.rev !== undefined) adopt(d.state, d.rev);
    if (d.look) setMarket(d.look);
    say(d.ok ? done(d) : (d.error ?? "The house can't be reached just now."), d.ok);
    if (!d.ok) lookAround();
  };
  const priceFor = (what: string, suggested: number): number | null => {
    const asked = window.prompt(`What do you want for the ${what}?`, String(suggested));
    const price = asked === null ? NaN : Math.round(Number(asked.replace(/[^0-9.]/g, "")));
    return Number.isFinite(price) && price >= 5 ? price : null;
  };

  const race = (rival: Rival | null, road = false, tune = false) => {
    if (!car) return;
    wakeArcadeSound();
    saveDriveStrip(strip);
    setRacing({ car: car.id, carName: car.name, build: car.build, rival, key: Date.now(), road, tune });
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
      // The wear, the bends in it and the fines all come home with the car.
      afterRace(g, was.car, { ...outcome.mine, won });
      settleUp(g, (won ? stake : lost ? -stake : 0) - outcome.mine.fines);
      const bent = g.cars.find((c) => c.id === was.car)?.body ?? 0;
      if (was.tune) {
        // The tuner is paid when he has had his pulls, and not before.
        const done = outcome.mine.tuned ? garageAct(g, { cmd: "remote", car: was.car }) : null;
        return { ok: !!done?.ok, message: done ? (done.ok ? `${done.message}${bent ? " Shame about the bodywork." : ""}` : done.message) : `He did not get his pulls: ${outcome.mine.pulls} of 3. No tune, and nothing to pay.${bent ? " The car has something to show for it, though." : ""}` };
      }
      const bills = [outcome.mine.fines ? `${dollars(outcome.mine.fines)} in fines` : "", bent >= 1000 ? "the car, which is a write-off" : bent >= 300 ? "bodywork before it goes out again" : bent ? "a few dents" : ""].filter(Boolean).join(" and ");
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

  if (racing?.road) return <Road key={racing.key} rules={mountainRoad.normalize({ id: racing.tune ? "remote" : route })} build={racing.build} carName={racing.carName} rival={racing.rival} onDone={downFromTheMountain} />;
  if (racing) return <Strip key={racing.key} rules={rules} build={racing.build} carName={racing.carName} rival={racing.rival} onDone={home} />;

  const cheapest = Math.min(...view.listings.map((l) => l.price));
  const broke = view.cars.length === 0 && view.cash < cheapest;
  const model = car ? CAR_MODELS[car.build[0]!]! : null;
  const level = (slot: string) => car?.parts.find((x) => x.slot === slot)?.level ?? 0;
  const mine = car && model ? { model: model.key, tone: paintOf(car.id), bent: car.body, tyres: level("tyres") } : null;
  const when = new Date(garage.day * 86_400_000);

  /** Walk somewhere: whatever was in hand is put down. */
  const go = (to: Place, pickedThere: string | null = null) => {
    wakeArcadeSound();
    setPlace(to);
    setSel(pickedThere);
    setJob(null);
    setHover(null);
    if (to === "board") lookAround();
  };
  /** A job that has bolts in it: it is done when the last one is out. */
  const wrench = (spot: string, label: string, run: () => void, bolts = 4) => setJob({ spot, label, left: Array.from({ length: bolts }, (_, i) => i), run });
  const undo = (bolt: number) => {
    if (!job) return;
    const left = job.left.filter((x) => x !== bolt);
    blip(300 + left.length * 60, 0.05, "square", 0.04);
    if (left.length) return setJob({ ...job, left });
    setJob(null);
    job.run();
  };
  const picking = {
    sel,
    hint: setHover,
    bolts: job,
    undo,
    pick: (spot: string) => {
      if (place !== "garage") {
        setJob(null);
        setPulled(0);
        return setSel(spot);
      }
      if (spot === "door" && !car) return say("There is nothing to drive. The paper is on the bench.");
      go(spot === "door" ? "out" : (spot as Place));
    },
  };

  /** One of the bolt-on parts: what is on the car, and what could go on in its place. */
  const partPanel = (slot: string) => {
    const part = car?.parts.find((x) => x.slot === slot);
    if (!car || !part) return <p className="facts">There is nothing here to change on this car.</p>;
    const bolts = slot === "tyres" ? 5 : 4;
    const fit = (label: string, command: Record<string, unknown>) => wrench(slot, label, () => act({ ...command, car: car.id }), bolts);
    return (
      <>
        <h3>{part.label} <span className="has">{part.has}</span></h3>
        <p className="facts">{part.hint}</p>
        {job?.spot === slot ? (
          <div className="sr-acts">
            <p className="sr-do">{job.label} {job.left.length} {slot === "tyres" ? "wheel nuts" : "bolts"} to go. Undo them on the car.</p>
            <button type="button" onClick={() => setJob(null)}>Leave it</button>
          </div>
        ) : part.needs ? (
          <p className="bad">That is a job for {part.needs === "jack" ? "a jack" : "wrenches"}, and there {part.needs === "jack" ? "is none" : "are none"} on the wall.</p>
        ) : (
          <div className="sr-acts">
            {part.shelf !== null && <button type="button" className="yes" onClick={() => fit("Fitting the one off your shelf.", { cmd: "bolt", piece: part.shelf })}>Fit the one on your shelf<i>Free</i></button>}
            {part.next && <button type="button" disabled={!part.next.can} onClick={() => fit(`Fitting: ${part.next!.label}.`, { cmd: "fit", slot, level: part.next!.level })}>{part.next.label}<i>{dollars(part.next.cost)} new</i></button>}
            {part.next?.rix && <button type="button" className="rix" disabled={view.cash < part.next.rix.price} onClick={() => fit("Fitting the used one from Rix Racing.", { cmd: "fit", slot, level: part.next!.level, rix: part.next!.rix!.id })}>The same, used<i>{dollars(part.next.rix.price)} at Rix Racing</i></button>}
            {part.level > 0 && <button type="button" className="off" onClick={() => fit("Taking it off.", { cmd: "pull", slot })}>Take it off<i>Onto the shelf</i></button>}
            {!part.next && part.level > 0 && <span className="maxed">Nothing better is made for it.</span>}
          </div>
        )}
      </>
    );
  };

  /** What the panel under the picture says about the thing you picked. */
  const about = () => {
    if (place === "garage") {
      if (!car) return <p className="empty">Nothing in here but an oil stain. {broke ? "And not enough for a car." : "The paper on the bench is where it starts."}</p>;
      return (
        <>
          <p className="facts">{car.sheet.year} {car.sheet.model} · {car.sheet.tier} · {car.sheet.drive} · {car.sheet.gearbox} · {car.sheet.mass} kg · worth {dollars(car.value)}</p>
          <div className="pinks-numbers">
            <div><small>Power</small><b>{car.runs ? `${car.sheet.horsepower} hp` : "—"}</b></div>
            <div><small>Quarter mile</small><b>{car.sheet.quarter ? `${seconds(car.sheet.quarter.et)} s` : "—"}</b></div>
            <div><small>At the line</small><b>{car.sheet.quarter ? `${car.sheet.quarter.mph} mph` : "—"}</b></div>
            <div><small>Record</small><b>{car.wins} of {car.races}</b></div>
          </div>
          {!car.runs && <p className="bad">{car.totaled ? "It is a write-off." : car.body >= 300 ? "It is too bent to drive." : "It will not start."}</p>}
        </>
      );
    }
    if (!car) return null;
    if (place === "hood") {
      if (sel === "cam" || sel === "intake" || sel === "boost") return partPanel(sel);
      if (sel === "block") return (
        <>
          <h3>The engine</h3>
          <Wear label="Engine" value={car.engine}>{car.repairs.engine > 0 && <Job label="Rebuild it" cost={car.repairs.engine} tool={tools.wrenches ? null : "wrenches"} cash={view.cash} onClick={() => act({ cmd: "engine", car: car.id })} />}</Wear>
          <p className="facts">Every pass wears it. Run it short of oil, or lean, and it goes all at once.</p>
        </>
      );
      if (sel === "plugs") return (
        <>
          <h3>Plugs</h3>
          <Wear label="Plugs" value={car.plugs}>{car.repairs.plugs > 0 && <Job label="New plugs" cost={car.repairs.plugs} tool={tools.wrenches ? null : "wrenches"} cash={view.cash} onClick={() => act({ cmd: "plugs", car: car.id })} />}</Wear>
          <p className="facts">A rich mixture fouls them, and fouled plugs cost power.</p>
        </>
      );
      if (sel === "oil") return (
        <>
          <h3>Oil</h3>
          <Wear label="Oil" value={car.oil}>{car.repairs.oil > 0 && <Job label="Change it" cost={car.repairs.oil} tool={tools.wrenches ? null : "wrenches"} cash={view.cash} onClick={() => act({ cmd: "oil", car: car.id })} />}</Wear>
          <p className="facts">Old oil loses pressure at high revs. Watch the gauge on a pass.</p>
        </>
      );
      if (sel === "fuel") return (
        <>
          <div className="row"><h3>The mixture screw</h3><span className={`pinks-afr ${car.mixture}`}><b>{(car.afr / 10).toFixed(1)}</b> : 1 · {car.mixture === "right" ? "On the money" : car.mixture === "lean" ? "Lean" : "Rich"}</span></div>
          <div className="pinks-fuel">
            <button type="button" disabled={car.fuel <= 0} onClick={() => act({ cmd: "fuel", car: car.id, fuel: car.fuel - 1 })} aria-label="Less fuel">Leaner</button>
            <div className="scale" aria-hidden="true">{Array.from({ length: car.fuelMax + 1 }, (_, i) => <i key={i} className={i === car.fuel ? "on" : ""} />)}</div>
            <button type="button" disabled={car.fuel >= car.fuelMax} onClick={() => act({ cmd: "fuel", car: car.id, fuel: car.fuel + 1 })} aria-label="More fuel">Richer</button>
          </div>
          <p className="facts">{car.mixture === "lean" ? "Lean makes a little more power and a lot more heat. Work it hard like this and it will let go." : car.mixture === "rich" ? "Rich is safe and slow, and it is fouling the plugs." : "It is where this engine wants it. Anything that helps it breathe will want more fuel."} The tuner in Morgantown will set it for you, for money.</p>
        </>
      );
      return (
        <>
          <Wear label="Engine" value={car.engine} /><Wear label="Oil" value={car.oil} /><Wear label="Plugs" value={car.plugs} />
          <p className="facts">Pick something in the bay.</p>
        </>
      );
    }
    if (place === "under") {
      if (sel === "exhaust" || sel === "trans") return partPanel(sel);
      if (sel === "tyres") return (
        <>
          <Wear label="Tyres" value={car.rubber}>{car.repairs.tyres > 0 && <Job label="New set" cost={car.repairs.tyres} tool={tools.jack ? null : "a jack"} cash={view.cash} onClick={() => act({ cmd: "tyres", car: car.id })} />}</Wear>
          {partPanel("tyres")}
        </>
      );
      if (sel === "final") return (
        <>
          <h3>Final drive</h3>
          <p className="facts">Shorter leaves harder and runs out sooner. Free to change.</p>
          <span className="pinks-final">{["Tall", "Stock", "Short"].map((name, i) => <button key={name} type="button" className={car.final === i ? "on" : ""} onClick={() => act({ cmd: "final", car: car.id, final: i })}>{name}</button>)}</span>
        </>
      );
      return <p className="facts">{tools.jack ? "It is up on stands." : "No jack, so it is up on blocks. Tyres will not come off like this."} Pick something underneath.</p>;
    }
    if (place === "body") {
      if (sel === "weight") return partPanel(sel);
      if (sel === "panels") return (
        <>
          <h3>Bodywork</h3>
          <Wear label="Body" value={1000 - car.body} dead="Write-off">{car.repairs.body > 0 && <Job label="Straighten it" cost={car.repairs.body} tool={tools.hammer ? null : "a hammer"} cash={view.cash} onClick={() => act({ cmd: "body", car: car.id })} />}</Wear>
          {car.totaled && (
            <div className="sr-acts">
              <p className="bad">It is a write-off. No hammer fixes that.</p>
              <button type="button" onClick={() => { act({ cmd: "scrap", car: car.id }); setPicked(null); go("garage"); }}>Scrap it<i>{dollars(car.scrap)}</i></button>
              <button type="button" className="yes" disabled={!tools.wrenches} onClick={() => { act({ cmd: "salvage", car: car.id }); setPicked(null); go("garage"); }}>Pull the parts first<i>{tools.wrenches ? dollars(car.salvage) : "Needs wrenches"}</i></button>
            </div>
          )}
        </>
      );
      if (sel === "plate") return (
        <form className="sr-acts" onSubmit={(e) => { e.preventDefault(); if (naming !== null) act({ cmd: "name", car: car.id, name: naming }); setNaming(null); }}>
          <h3>What it is called</h3>
          <input value={naming ?? car.name} maxLength={28} onChange={(e) => setNaming(e.target.value)} aria-label="The car's name" />
          <button type="submit" className="yes">Paint it on</button>
        </form>
      );
      if (sel === "sell") return (
        <>
          <h3>Get rid of it</h3>
          <div className="sr-acts">
            <button type="button" onClick={() => { if (window.confirm(`Sell ${car.name} to the dealer for ${dollars(car.sells)}?`)) { act({ cmd: "sell", car: car.id }); setPicked(null); go("garage"); } }}>Sell it to the dealer<i>{dollars(car.sells)}</i></button>
            {house && <button type="button" onClick={() => { const price = priceFor(car.name, car.value); if (price) { void trade({ do: "list", car: car.id, price }, () => `${car.name} is up for sale in ${house.name} at ${dollars(price)}.`); setPicked(null); go("garage"); } }}>Put it up in {house.name}<i>Name your price</i></button>}
            <button type="button" disabled={!tools.wrenches || !tools.jack} onClick={() => { if (window.confirm(`Tear ${car.name} down for parts? It comes to about ${dollars(car.teardown)} in pieces today, and there is no putting it back.`)) { act({ cmd: "strip", car: car.id }); setPicked(null); go("shelf"); } }}>Tear it down for parts<i>{tools.wrenches && tools.jack ? `About ${dollars(car.teardown)} in pieces` : "Needs wrenches and a jack"}</i></button>
          </div>
        </>
      );
      return <p className="facts">Worth {dollars(car.value)} as it stands. Pick a part of it.</p>;
    }
    if (place === "out") {
      if (!car.runs) return <p className="bad">{car.totaled ? "It is not going anywhere again." : car.body >= 300 ? "It is too bent to drive. It needs straightening first." : "It will not start. The engine needs a rebuild first."}</p>;
      if (sel === "strip") {
        const them = locals.length ? locals[pulled % locals.length]! : null;
        return (
          <>
            <div className="row">
              <h3>{rules.name ?? "The strip"}</h3>
              <label className="pinks-where">Tonight it is <select value={strip} onChange={(e) => setStrip(e.target.value)}>{PINKSLIPS_PRESETS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            </div>
            <p className="facts">{pinkSlips.describe(rules).slice(0, 2).join(" ")}</p>
            {!them && <p className="facts">Nobody will line up against it until it has put a time on the board.</p>}
            {them && <p className="sr-says"><b>{them.name}</b> pulls up in a {them.car}. Runs about {seconds(them.et)}. “{them.pitch}”</p>}
            <div className="sr-acts">
              {them && <button type="button" className="yes" disabled={view.cash < them.stake} onClick={() => race(them)}>Race {them.name}<i>For {dollars(them.stake)}</i></button>}
              {locals.length > 1 && <button type="button" onClick={() => { setPulled(pulled + 1); blip(220, 0.08, "triangle", 0.04); }}>Wave them on<i>See who is next</i></button>}
              <button type="button" onClick={() => race(null)}>Make a pass alone<i>Nothing riding on it</i></button>
            </div>
          </>
        );
      }
      if (sel === "mountain") return (
        <>
          <div className="row">
            <h3>The mountain road</h3>
            <label className="pinks-where">Which run <select value={route} onChange={(e) => setRoute(e.target.value)}>{MOUNTAIN_ROAD_PRESETS.filter((x) => x.id !== "remote").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          </div>
          <p className="facts">{mountainRoad.describe(mountainRoad.normalize({ id: route }))[0]} Fines come out of your cash, and whatever you hit comes home on the car.</p>
          <div className="sr-acts">
            <button type="button" className="yes" onClick={() => race(null, true)}>Take it out<i>Nobody to beat but the clock</i></button>
            {locals[1] && <button type="button" disabled={view.cash < locals[1].stake} onClick={() => race(locals[1]!, true)}>Run it against {locals[1].name}<i>{locals[1].car} · for {dollars(locals[1].stake)}</i></button>}
          </div>
        </>
      );
      if (sel === "tuner") return (
        <>
          <div className="row"><h3>Morgantown</h3><span className={`pinks-afr ${car.mixture}`}><b>{(car.afr / 10).toFixed(1)}</b> : 1 · {car.mixture === "right" ? "On the money" : car.mixture === "lean" ? "Lean" : "Rich"}</span></div>
          <p className="facts">Three pulls on the rollers and it comes back right. Or he tunes it from his laptop while you make the pulls on a dark road: foot flat, no lifting, and there are deer. You pay him only if he gets his pulls.</p>
          <div className="sr-acts">
            <button type="button" disabled={view.cash < DYNO_COST || car.mixture === "right"} onClick={() => act({ cmd: "dyno", car: car.id })}>The dyno<i>{car.mixture === "right" ? "It's right already" : dollars(DYNO_COST)}</i></button>
            <button type="button" disabled={view.cash < REMOTE_TUNE_COST || car.mixture === "right"} onClick={() => race(null, true, true)}>A remote tune<i>{car.mixture === "right" ? "It's right already" : dollars(REMOTE_TUNE_COST)}</i></button>
          </div>
        </>
      );
      return <p className="facts">The end of the street. Pick a sign.</p>;
    }
    return null;
  };

  const ad = place === "paper" ? view.listings.find((l) => String(l.id) === sel) ?? null : null;
  const them = place === "out" && sel === "strip" && locals.length ? locals[pulled % locals.length]! : null;

  return (
    <div className="pinks sr">
      <header className="pinks-top">
        <button type="button" className="pinks-back" onClick={onHome}>← Games</button>
        <h1>🏁 Road to the Shootout</h1>
        <div className="pinks-till">
          <div><small>Cash</small><b className="cash">{dollars(view.cash)}</b></div>
          <div><small>Races</small><b>{view.record.wins} of {view.record.races}</b></div>
        </div>
      </header>

      <main className="sr-stage">
        <div className="sr-screen">
          {place === "garage" && <GarageScene look={{ car: mine, tools, shelf: view.shelf.length, date: [MONTHS[when.getUTCMonth()]!, when.getUTCDate()], house: !!house }} p={picking} />}
          {place === "hood" && car && model && <EngineBay look={{ tone: paintOf(car.id), intake: level("intake"), cam: level("cam"), boost: level("boost"), turbo: !!model.turbo, engine: car.engine, oil: car.oil, plugs: car.plugs, mixture: car.mixture }} p={picking} />}
          {(place === "under" || place === "body") && car && mine && model && <SideView lifted={place === "under"} look={{ ...mine, exhaust: level("exhaust"), trans: level("trans"), weight: level("weight"), jack: tools.jack, rear: model.drive !== "fwd", forSale: false }} p={picking} />}
          {place === "out" && mine && (sel === "strip" ? <Lot mine={mine} theirs={them ? { model: CAR_MODELS[them.build[0]!]!.key, tone: paintOf(pulled * 3 + 4) } : null} name={them?.name ?? null} /> : <Junction car={mine} p={picking} />)}

          {place === "paper" && (
            <div className="sr-paper">
              <div className="masthead"><small>{MONTHS[when.getUTCMonth()]} {when.getUTCDate()}</small><b>The Valley Trader</b><small>Free · every day</small></div>
              {view.news && <p className="lead">{view.news}</p>}
              {broke && (
                <div className="note">
                  <p>No car and not enough for one. Your cousin will front you the money for a shitbox, this once more.</p>
                  <button type="button" onClick={() => change((g) => { settleUp(g, Math.max(GARAGE_STAKE / 2, cheapest) - g.cash); return { ok: true, message: "Don't make him regret it." }; })}>Take it</button>
                </div>
              )}
              <h2>Autos for sale</h2>
              <ul>
                {view.listings.map((l) => (
                  <li key={l.id}>
                    <button type="button" className={String(l.id) === sel ? "ad on" : "ad"} onClick={() => setSel(String(l.id))}>
                      <b>{l.sheet.year} {l.sheet.model}</b>
                      <span>{l.partsCar ? "FOR PARTS. " : ""}{l.pitch}</span>
                      <em>{dollars(l.price)}{l.watching ? " · someone is looking" : ""}</em>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="small">WE BUY CARS. Any state. The dealer pays cash, and not much of it. · New listings tomorrow. A seller's word is a seller's word.</p>
            </div>
          )}

          {place === "laptop" && (
            <div className="sr-laptop">
              <div className="tabs">
                <button type="button" className={site === "rix" ? "on" : ""} onClick={() => setSite("rix")}>Rix Racing</button>
                <button type="button" className={site === "speed" ? "on" : ""} onClick={() => setSite("speed")}>Ridgeline Speed</button>
              </div>
              <div className="address">{site === "rix" ? "rixracing.example/used-parts" : "ridgelinespeed.example/catalog"}</div>
              {site === "rix" ? (
                <div className="site">
                  <h2>Rix Racing <small>used parts, off cars Ricky has taken apart</small></h2>
                  <ul>{view.rix.map((r) => <li key={r.id}><div><b>{r.name}</b><small>{r.label} · off a {r.tier.toLowerCase()}</small></div><b>{dollars(r.price)}</b></li>)}</ul>
                  {view.rix.length === 0 && <p>Nothing in today.</p>}
                  <p className="small">A used part goes on at the car, when it is the next step for that car. Stock changes every day.</p>
                </div>
              ) : (
                <div className="site">
                  <h2>Ridgeline Speed <small>new parts{car ? ` for your ${car.sheet.model}` : ""}</small></h2>
                  {car ? <ul>{car.parts.map((x) => <li key={x.slot}><div><b>{x.next ? x.next.label : x.has}</b><small>{x.label} · {x.hint}</small></div><b>{x.next ? dollars(x.next.cost) : "Fitted"}</b></li>)}</ul> : <p>No car on file. Buy one first.</p>}
                  <p className="small">Order at the car: pick the part on it, and it is delivered as you undo the bolts.</p>
                </div>
              )}
            </div>
          )}

          {place === "tools" && (
            <div className="sr-sheet">
              <h2>The tool wall</h2>
              <ul className="pinks-locals">
                {view.tools.map((t) => (
                  <li key={t.tool}>
                    <div><b>{t.label}</b><small>{t.hint}</small></div>
                    {t.owned ? <span className="maxed">On the wall</span> : <button type="button" className="yes" disabled={!t.can} onClick={() => act({ cmd: "tool", tool: t.tool })}>Buy it · {dollars(t.cost)}</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {place === "shelf" && (
            <div className="sr-sheet">
              <h2>Your shelf <small>{view.shelf.length} of {view.shelfSpace}</small></h2>
              {view.gluts.length > 0 && <p className="facts">Flooded today: {view.gluts.map((x) => `${KINDS[x.kind] ?? x.label.toLowerCase()} (${x.by})`).join(", ")}. Those go for a little over half.</p>}
              {view.shelf.length === 0 && <p className="empty">Nothing on it. Take a part off a car, or tear a parts car down.</p>}
              <ul className="pinks-locals">
                {view.shelf.map((x) => (
                  <li key={x.id}>
                    <div><b>{x.name}</b><small>off a {x.from} · {Math.round(x.cond / 10)}%{x.glut ? ` · ${x.glut} has flooded these` : ""}</small></div>
                    <span className="pinks-buy">
                      <button type="button" className={x.glut ? "low" : ""} onClick={() => act({ cmd: "sellPiece", piece: x.id })}>Sell {dollars(x.value)}</button>
                      {house && <button type="button" className="off" onClick={() => { const price = priceFor(x.name, x.worth); if (price) void trade({ do: "list", piece: x.id, price }, () => `Up for sale in ${house.name} at ${dollars(price)}.`); }}>Pin it on the board</button>}
                    </span>
                  </li>
                ))}
              </ul>
              {view.shelf.length > 1 && <button type="button" onClick={() => change((g) => { let made = 0; for (const x of [...g.shelf]) { const was = g.cash; if (garageAct(g, { cmd: "sellPiece", piece: x.id }).ok) made += g.cash - was; } return { ok: true, message: `The lot went for ${dollars(made)}.` }; })}>Sell the lot for {dollars(view.shelf.reduce((sum, x) => sum + x.value, 0))}</button>}
            </div>
          )}

          {place === "board" && (
            <div className="sr-sheet">
              <h2>{house ? `${house.name}'s board` : "The notice board"}</h2>
              {house ? (
                <>
                  <p className="facts">Your garage is kept in <b>{house.name}</b>: the same one on any device you are in that house on. <button type="button" className="fine" onClick={() => keepHouse(null)}>Keep it in this browser only</button></p>
                  {market && market.waiting > 0 && (
                    <div className="pinks-card cousin">
                      <p>Something of yours sold. {dollars(market.waiting)} is waiting for you.</p>
                      <button type="button" className="yes" onClick={() => void trade({ do: "collect" }, (d) => (d.sales?.length ? d.sales.map((x) => `${x.from} bought your ${x.what.toLowerCase()} for ${dollars(x.amount)}.`).join(" ") : "Nothing was waiting."))}>Collect it</button>
                    </div>
                  )}
                  {!market && <p className="empty">Asking the house…</p>}
                  <ul className="pinks-lots">
                    {market?.lots.map((l) => (
                      <li key={l.id} className={`pinks-card${l.mine ? " mine" : ""}`}>
                        <div className="row"><b>{l.piece ? l.piece.name : l.car?.name}</b><b className="cash">{dollars(l.price)}</b></div>
                        <p className="facts">{l.piece ? `Off a ${l.piece.from} · ${Math.round(l.piece.cond / 10)}% · worth about ${dollars(l.piece.worth)}` : l.car ? `${l.car.model} · engine ${Math.round(l.car.engine / 10)}% · ${l.car.runs ? "runs" : "does not run"} · about ${dollars(l.car.teardown)} in pieces` : ""}</p>
                        <div className="row">
                          <span className="has">{l.mine ? "Yours" : l.scrapper ? l.seller : `From ${l.seller}`}</span>
                          {l.mine ? <button type="button" onClick={() => void trade({ do: "unlist", id: l.id }, () => "Back in your garage.")}>Take it back</button> : <button type="button" className="yes" disabled={view.cash < l.price} onClick={() => void trade({ do: "buy", id: l.id }, (d) => `${d.bought ?? "It"} is yours.`)}>{view.cash < l.price ? "Can't afford it" : "Buy it"}</button>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {club.length > 0 && (
                    <>
                      <h3>Who has what</h3>
                      <ul className="pinks-locals">
                        {club.map((m) => <li key={m.id}><div><b>{m.name}{m.me ? " (you)" : ""}</b><small>{m.cars.length ? m.cars.map((c) => `${c.name}${c.quarter ? ` ${seconds(c.quarter)}` : ""}`).join(" · ") : "An empty garage"}</small></div><span className="has">{m.wins} of {m.races}</span></li>)}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="facts">Your garage is kept in this browser. Keep it in a house to have it on every device, and to trade parts and cars with the people in it.</p>
                  {myHouses.length > 0 ? <div className="sr-acts">{myHouses.map((h) => <button key={h.slug} type="button" onClick={() => void moveIn(h.slug)}>Keep it in {h.name}</button>)}</div> : <p className="empty">You are not in a house yet. Join one from the games page.</p>}
                </>
              )}
            </div>
          )}

          {place === "manual" && (
            <div className="sr-sheet">
              <h2>The manual</h2>
              <ol>
                <li>Hold the revs up in neutral while you wait.</li>
                <li>On the green, shift into first. Before the green is a red light, and you lose.</li>
                <li>Shift up when the light by the tach comes on. Past the redline the engine cooks.</li>
                <li>If the tyres spin, lift a little.</li>
                <li>Watch the oil pressure. If it falls behind the revs, shift early, and change the oil.</li>
              </ol>
              <p>On the strip: <kbd>W</kbd> or <kbd>↑</kbd> throttle · <kbd>S</kbd> or <kbd>↓</kbd> half throttle · <kbd>Space</kbd> or <kbd>D</kbd> shift up · <kbd>A</kbd> shift down · <kbd>C</kbd> get in or step back</p>
              <p>On the road: <kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> steer · <kbd>W</kbd> throttle · <kbd>S</kbd> brake · <kbd>E</kbd> shift up · <kbd>Q</kbd> shift down</p>
              <p className="facts">On a phone there is a pedal and a shifter on the screen. Slide your thumb down the pedal to lift.</p>
            </div>
          )}
        </div>

        <section className="sr-console" aria-live="polite">
          <header>
            <h2>{place === "garage" ? (car ? car.name : "The garage") : PLACES[place]}{place !== "garage" && car && (place === "hood" || place === "under" || place === "body" || place === "out") ? <small>{car.name}</small> : null}</h2>
            {place === "out" && sel ? <button type="button" onClick={() => setSel(null)}>← The junction</button> : null}
            {place !== "garage" && <button type="button" onClick={() => go("garage")}>← The garage</button>}
          </header>
          <p className="sr-hint">&gt; {hover ?? (place === "garage" ? "Point at something." : place === "paper" ? "Pick an ad to read it." : job ? job.label : "…")}</p>

          {place === "paper" && ad && (
            <div className="sr-ad">
              <div className="row"><h3>{ad.sheet.year} {ad.sheet.model} <span className="has">{ad.partsCar ? "Parts car" : ad.sheet.tier}</span></h3><b className="cash">{dollars(ad.price)}</b></div>
              <dl className="sr-spec">
                <div><dt>Power</dt><dd>{ad.sheet.horsepower} hp</dd></div>
                <div><dt>Quarter mile</dt><dd>{ad.sheet.quarter ? `${seconds(ad.sheet.quarter.et)} s` : "Won't run"}</dd></div>
                <div><dt>At the line</dt><dd>{ad.sheet.quarter ? `${ad.sheet.quarter.mph} mph` : "—"}</dd></div>
                <div><dt>Weight</dt><dd>{ad.sheet.mass} kg</dd></div>
                <div><dt>Drive</dt><dd>{ad.sheet.drive.replace(" drive", "")}</dd></div>
                <div><dt>Gearbox</dt><dd>{ad.sheet.gearbox}</dd></div>
              </dl>
              <Wear label="Engine" value={ad.engine} /><Wear label="Tyres" value={ad.rubber} />
              {ad.partsCar && <p className="facts">Bent {Math.round(ad.body / 10)}%. In pieces it comes to about <b>{dollars(ad.teardown)}</b>, on a good day.</p>}
              {ad.watching && <p className="bad">{ad.watching} is looking at this one. {ad.movesLeft <= 1 ? "It will be gone the next thing you do." : `Gone in ${ad.movesLeft} moves.`}</p>}
              <div className="sr-acts"><button type="button" className="yes" disabled={!ad.can} onClick={() => { const g = act({ cmd: "buy", listing: ad.id }); const got = g.cars.at(-1); if (got && g.cars.length > garage.cars.length) { setPicked(got.id); go("garage"); } }}>{ad.can ? "Call the number" : view.cars.length >= view.bays ? "No room in the garage" : "Can't afford it"}<i>{dollars(ad.price)}, as it sits</i></button></div>
            </div>
          )}
          {about()}

          {place === "garage" && view.cars.length > 0 && (
            <div className="sr-keys" role="group" aria-label="Your cars">
              <small>Keys · {view.cars.length} of {view.bays} bays</small>
              {view.cars.map((c) => <button key={c.id} type="button" className={c.id === car?.id ? "on" : ""} onClick={() => setPicked(c.id)}>{c.name}</button>)}
            </div>
          )}
        </section>
      </main>

      {toast && <div className={toast.ok ? "pinks-toast" : "pinks-toast no"} key={toast.key} role="status">{toast.text}</div>}
    </div>
  );
}

/** A job on a car: what it costs, or the tool it is waiting for. */
function Job({ label, cost, tool, cash, onClick }: { label: string; cost: number; tool: string | null; cash: number; onClick: () => void }) {
  return <button type="button" disabled={!!tool || cash < cost} onClick={onClick}>{tool ? `Needs ${tool}` : `${label} ${dollars(cost)}`}</button>;
}

function Wear({ label, value, dead = "Blown", children }: { label: string; value: number; dead?: string; children?: React.ReactNode }) {
  const tone = value === 0 ? "dead" : value < 350 ? "low" : value < 700 ? "mid" : "good";
  return (
    <div className="pinks-wear">
      <span>{label}</span>
      <div className={`bar ${tone}`}><i style={{ width: `${value / 10}%` }} /></div>
      <em>{value === 0 ? dead : `${Math.round(value / 10)}%`}</em>
      {children}
    </div>
  );
}

