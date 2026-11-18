// What the sim's numbers are called. The sim knows parts by number and shelves by number; this is
// the page's side of that: names, and the words the game says. Every part is a plain kind of part,
// with no maker's name on it.
import { EVENT, type GameEvent } from "./sim.ts";

export const SHELVES = ["Filters", "Brakes", "Belts & hoses", "Batteries", "Starters & alternators", "Exhaust", "Fluids", "Wipers & lights"] as const;

/** In the sim's order: six to a shelf. */
export const PARTS = [
  "Oil filter, small",
  "Oil filter, large",
  "Engine air filter",
  "Cabin air filter",
  "Fuel filter",
  "Transmission filter kit",

  "Front pad set",
  "Rear pad set",
  "Front rotor",
  "Rear rotor",
  "Caliper, remanufactured",
  "Brake hose",

  "Serpentine belt",
  "Timing belt kit",
  "Upper radiator hose",
  "Lower radiator hose",
  "Heater hose, per foot",
  "Belt tensioner",

  "Battery, small",
  "Battery, mid-size",
  "Battery, large",
  "Battery, truck",
  "Terminal cleaner & clamps",
  "Jump starter box",

  "Starter, remanufactured",
  "Alternator, remanufactured",
  "Starter solenoid",
  "Alternator pulley",
  "Spark plug set",
  "Ignition coil",

  "Muffler",
  "Catalytic converter",
  "Flex exhaust pipe",
  "Oxygen sensor",
  "Exhaust clamp",
  "Gasket kit",

  "Motor oil, 5 qt",
  "Antifreeze, gallon",
  "Washer fluid, gallon",
  "Brake fluid",
  "Transmission fluid, qt",
  "Grease tube",

  "Wiper blade, 22 in",
  "Wiper blade, 26 in",
  "Headlight bulb pair",
  "Taillight bulb",
  "Fuse assortment",
  "Sealed beam headlamp",
] as const;

export const SPEEDS = [
  { value: "0", label: "Paused", tics: 0 },
  { value: "1", label: "1×", tics: 10 },
  { value: "4", label: "4×", tics: 40 },
  { value: "16", label: "16×", tics: 160 },
  { value: "64", label: "64×", tics: 640 },
] as const;

/** Tics a second at the slowest speed: an hour of the store's day is a second. */
export const TICS_PER_SECOND = 10;

/** Units a day a part sells at its fair price on an ordinary day: the table's rate is tenths of a unit, and the sim brings a share of it. */
export const perDay = (rate: number, demandPercent: number) => (rate * demandPercent) / 1000;

/** Money in cents as the page says it. */
export const money = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dollars = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.round(Math.abs(cents) / 100).toLocaleString()}`;

/** Names by number, for a number the sim may say that this list has no name for. */
export const partName = (part: number) => PARTS[part] ?? `part ${part}`;
export const shelfName = (shelf: number) => SHELVES[shelf] ?? `shelf ${shelf}`;

export interface Line {
  text: string;
  variant: "info" | "success" | "warning" | "danger";
  /** Worth interrupting the player for. The rest go in the log only. */
  toast: boolean;
}

/** What an event is, in the store's own words. */
export function say(event: GameEvent): Line | null {
  const { a, b } = event;
  switch (event.kind) {
    case EVENT.SOLD_OUT:
      return { text: `Sold out of ${partName(a)}.`, variant: "warning", toast: false };
    case EVENT.DELIVERED:
      return { text: `The truck is in: ${b} × ${partName(a)}.`, variant: "info", toast: false };
    case EVENT.AUTO:
      return { text: `Standing order: ${b} × ${partName(a)} on the truck.`, variant: "info", toast: false };
    case EVENT.RATS:
      return { text: `Rats got into the ${partName(a).toLowerCase()} (${b} lost). Living that dream.`, variant: "danger", toast: true };
    case EVENT.TRAP:
      return { text: "A trap went off in the night.", variant: "success", toast: false };
    case EVENT.COLD:
      return { text: "A cold snap is coming in. Batteries, antifreeze and wipers will move.", variant: "warning", toast: true };
    case EVENT.STRIKE:
      return { text: `${shelfName(a)}: the supplier is short. Wholesale is up about ${b}%, and the truck is slow.`, variant: "warning", toast: true };
    case EVENT.SALE:
      return { text: `${shelfName(a)}: the supplier is clearing stock. Wholesale is down about ${b}%.`, variant: "success", toast: true };
    case EVENT.RAIN:
      return { text: "Rain on the way. Wipers and lights will go.", variant: "info", toast: true };
    case EVENT.RENT:
      return { text: `Rent is paid: ${money(a)}.`, variant: "info", toast: true };
    case EVENT.DAY:
      return { text: `Day ${a + 1} is closed. The register took ${money(b)}.`, variant: "info", toast: false };
    default:
      return null;
  }
}
