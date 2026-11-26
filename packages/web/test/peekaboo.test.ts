// Peekaboo's rules: which picture comes next, the questions, and how the board changes.
import { describe, expect, it } from "vitest";
import { apply, emptyBoard, hint, MAX_POPPED, type BoardState } from "../src/peekaboo/board";
import { createBag, DEFAULT_SETTINGS, familyThings, FEW, findRound, inPlay, placeAt, randomFrom, THINGS, tidySettings, whereIs, type Settings } from "../src/peekaboo/things";

const byId = new Map(THINGS.map((t) => [t.id, t]));
const thing = (id: string) => byId.get(id);
const cow = "animals:cow";
const dog = "animals:dog";

describe("the pictures", () => {
  it("each has its own id, a word and something to say", () => {
    expect(new Set(THINGS.map((t) => t.id)).size).toBe(THINGS.length);
    expect(thing(cow)).toMatchObject({ word: "Cow", say: "Cow! Moo!" });
    expect(thing("vehicles:fire-truck")?.word).toBe("Fire truck");
  });

  it("puts family members in by name, leaving out a blank one", () => {
    const family = familyThings([{ name: "Mama", emoji: "👩" }, { name: " ", emoji: "🙂" }, { name: "Grammi", emoji: "👵", photo: "data:image/jpeg;base64,x" }]);
    expect(family.map((f) => f.word)).toEqual(["Mama", "Grammi"]);
    expect(family[1]!.photo).toBe("data:image/jpeg;base64,x");
    expect(whereIs(family[0]!)).toBe("Where's Mama?");
    expect(whereIs(thing(dog)!)).toBe("Where's the dog?");
  });

  it("plays a few at a time when asked, the family always among them", () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, categories: ["animals", "family"], few: true };
    const few = inPlay(settings, [{ name: "Mama", emoji: "👩" }], randomFrom(7));
    expect(few).toHaveLength(FEW);
    expect(few[0]!.word).toBe("Mama");
    const all = inPlay({ ...settings, few: false }, [], randomFrom(7));
    expect(all.length).toBe(THINGS.filter((t) => t.category === "animals").length);
  });

  it("shows every picture once before any comes again, never the same twice in a row", () => {
    const some = THINGS.slice(0, 5);
    const bag = createBag(some, randomFrom(3));
    const seen = Array.from({ length: 50 }, () => bag.next().id);
    for (let round = 0; round < 10; round++) expect(new Set(seen.slice(round * 5, round * 5 + 5)).size).toBe(5);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it("asks about one of the pictures, among different ones, not the last one asked", () => {
    const some = THINGS.slice(0, 4);
    for (let seed = 1; seed < 30; seed++) {
      const round = findRound(some, 3, randomFrom(seed), some[0]!.id);
      expect(round.choices).toHaveLength(3);
      expect(new Set(round.choices).size).toBe(3);
      expect(round.choices).toContain(round.target);
      expect(round.target).not.toBe(some[0]!.id);
    }
  });

  it("keeps a picture tapped at the edge wholly on the board", () => {
    expect(placeAt(0, 1)).toEqual({ x: 0.16, y: 0.84 });
    expect(placeAt(0.5, NaN)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("reads saved settings safely", () => {
    expect(tidySettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(tidySettings({ mode: "find", categories: ["vehicles", "nope", "vehicles"], few: false, choices: 3, sounds: false })).toEqual({ mode: "find", categories: ["vehicles"], few: false, choices: 3, sounds: false });
    expect(tidySettings({ mode: "rm -rf", categories: [] }).mode).toBe("tap");
  });
});

describe("the board", () => {
  const settings = DEFAULT_SETTINGS;
  const run = (state: BoardState, ...events: Parameters<typeof apply>[1][]) => events.reduce((s, e) => apply(s, e, thing, settings).state, state);

  it("pops pictures up and names them, keeping only the last few", () => {
    const { state, heard } = apply(emptyBoard("tap"), { t: "pop", id: cow, x: 0.5, y: 0.5, key: 1 }, thing, settings);
    expect(state.popped).toHaveLength(1);
    expect(heard).toEqual({ text: "Cow! Moo!", key: cow, sound: "pop" });
    const many = run(emptyBoard("tap"), ...Array.from({ length: 9 }, (_, i) => ({ t: "pop" as const, id: dog, x: 0.5, y: 0.5, key: i })));
    expect(many.popped.map((p) => p.key)).toEqual([5, 6, 7, 8].slice(-MAX_POPPED));
  });

  it("names just the word when sounds are off", () => {
    expect(apply(emptyBoard("tap"), { t: "pop", id: cow, x: 0.5, y: 0.5, key: 1 }, thing, { ...settings, sounds: false }).heard?.text).toBe("Cow!");
  });

  it("lifts the blanket once, with a peekaboo", () => {
    const hidden = run(emptyBoard("peek"), { t: "hide", id: cow });
    expect(hidden.hidden).toEqual({ id: cow, open: false });
    const lifted = apply(hidden, { t: "peek" }, thing, settings);
    expect(lifted.state.hidden?.open).toBe(true);
    expect(lifted.heard?.text).toBe("Peekaboo! Cow! Moo!");
    expect(apply(lifted.state, { t: "peek" }, thing, settings).heard).toBeNull();
  });

  it("asks, names a wrong tap gently, hints after two, and cheers a find", () => {
    let state = apply(emptyBoard("find"), { t: "ask", target: cow, choices: [dog, cow] }, thing, settings);
    expect(state.heard?.text).toBe("Where's the cow?");
    const wrong = apply(state.state, { t: "pick", id: dog }, thing, settings);
    expect(wrong.heard).toMatchObject({ text: "That's the dog! Where's the cow?", sound: "boop" });
    expect(wrong.state.round).toMatchObject({ misses: 1, wrong: dog, found: false });
    expect(hint(wrong.state)).toBe(false);
    const twice = apply(wrong.state, { t: "pick", id: dog }, thing, settings).state;
    expect(hint(twice)).toBe(true);
    const found = apply(twice, { t: "pick", id: cow }, thing, settings);
    expect(found.state.round?.found).toBe(true);
    expect(found.heard).toMatchObject({ text: "Yay! Cow! Moo!", sound: "cheer" });
    // Once found, more taps do nothing until the next question.
    expect(apply(found.state, { t: "pick", id: dog }, thing, settings).heard).toBeNull();
    state = apply(found.state, { t: "again" }, thing, settings);
    expect(state.heard).toBeNull();
  });

  it("ignores an event about a picture it doesn't know, or a question that doesn't hold together", () => {
    const board = emptyBoard("find");
    expect(apply(board, { t: "ask", target: cow, choices: [dog] }, thing, settings).state).toBe(board);
    expect(apply(board, { t: "ask", target: "animals:dragon", choices: ["animals:dragon"] }, thing, settings).state).toBe(board);
    expect(apply(emptyBoard("tap"), { t: "pop", id: "nope", x: 0, y: 0, key: 1 }, thing, settings).heard).toBeNull();
  });

  it("starts a new mode on an empty board", () => {
    const busy = run(emptyBoard("tap"), { t: "pop", id: cow, x: 0.5, y: 0.5, key: 1 });
    expect(apply(busy, { t: "settings", settings: { ...settings, mode: "peek" } }, thing, settings).state).toEqual(emptyBoard("peek"));
    expect(apply(busy, { t: "settings", settings }, thing, settings).state).toBe(busy);
  });
});
