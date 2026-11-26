// Storytime: a little picture book made from his own pictures, a page each, read by the device or
// by a grown-up (Grammi, on a call, turning the pages from her phone). It ends with good night.
import { shuffle, type Thing } from "./things";

export const PAGES = 8;

/** What a page says about its picture. */
export function pageText(th: Thing): string {
  const w = th.word.toLowerCase();
  const sound = th.say.slice(th.word.length + 1).trim();
  switch (th.category) {
    case "family":
      return `Here is ${th.word}! Hi, ${th.word}!`;
    case "animals":
      return th.sing ? `Here is the ${w}. The ${w} says ${th.sing}!` : `Here is the ${w}.${sound ? ` ${sound}` : ""}`;
    case "vehicles":
      return `Here comes the ${w}!${sound ? ` ${sound}` : ""}`;
    case "shapes":
      return `This is a ${w}.${sound ? ` ${sound}` : ""}`;
    case "colors":
      return `Look at ${w}!${sound ? ` ${sound}` : ""}`;
    default:
      return `Look, a ${w}!${sound ? ` ${sound}` : ""}`;
  }
}

/** The last page: good night to everyone in the book. */
export function goodNight(things: readonly Thing[]): string {
  const name = (th: Thing) => (th.category === "family" ? th.word : th.category === "colors" ? th.word.toLowerCase() : `${th.word.toLowerCase()}`);
  return `Good night, ${things.map(name).join(". Good night, ")}. Good night!`;
}

/** A book: up to eight of the pictures in play, family first (he knows them best), then the rest. */
export function makeBook(things: readonly Thing[], random: () => number): string[] {
  const family = things.filter((th) => th.category === "family");
  const rest = shuffle(
    things.filter((th) => th.category !== "family"),
    random,
  );
  return [...family.slice(0, 3), ...rest].slice(0, PAGES).map((th) => th.id);
}
