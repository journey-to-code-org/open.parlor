// Peekaboo's rules: which picture comes next, the questions, and how the board changes.
import { describe, expect, it } from "vitest";
import { apply, emptyBoard, hint, MAX_POPPED, type BoardState } from "../src/peekaboo/board";
import { createBag, mineThings, tidyMine, DEFAULT_SETTINGS, familyThings, FEW, findRound, inPlay, placeAt, randomFrom, THINGS, tidySettings, whereIs, type Settings } from "../src/peekaboo/things";

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

  it("has shapes and colours, drawn, and named without a stray \"the\" for a colour", () => {
    const shapes = THINGS.filter((t) => t.category === "shapes");
    const colors = THINGS.filter((t) => t.category === "colors");
    expect(shapes.map((t) => t.word)).toEqual(["Circle", "Square", "Triangle", "Star", "Heart", "Diamond", "Oval", "Rectangle"]);
    expect(colors).toHaveLength(10);
    expect([...shapes, ...colors].every((t) => t.draw && /^#[0-9a-f]{6}$/.test(t.draw.fill))).toBe(true);
    expect(thing("colors:red")?.say).toBe("Red! Like an apple!");
    expect(whereIs(thing("colors:red")!)).toBe("Where's red?");
    expect(whereIs(thing("shapes:circle")!)).toBe("Where's the circle?");
    // One word, one picture: no two things share a name a question could ask for.
    expect(new Set(THINGS.map((t) => t.word)).size).toBe(THINGS.length);
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

  it("asks among pictures of the same kind when there are enough", () => {
    const mixed = THINGS.filter((t) => t.category === "shapes" || t.category === "colors");
    for (let seed = 1; seed < 40; seed++) {
      const round = findRound(mixed, 3, randomFrom(seed));
      const kind = thing(round.target)!.category;
      expect(round.choices.every((id) => thing(id)!.category === kind)).toBe(true);
    }
    // Only one of its kind: the others come from elsewhere.
    const lone = [thing("colors:red")!, thing(cow)!, thing(dog)!];
    expect(findRound(lone, 2, () => 0).choices).toHaveLength(2);
  });

  it("keeps a picture tapped at the edge wholly on the board", () => {
    expect(placeAt(0, 1)).toEqual({ x: 0.16, y: 0.84 });
    expect(placeAt(0.5, NaN)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("reads saved settings safely", () => {
    expect(tidySettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(tidySettings({ mode: "find", categories: ["vehicles", "nope", "vehicles"], few: false, choices: 3, sounds: false, snaps: true, effects: false })).toEqual({ mode: "find", categories: ["vehicles"], few: false, choices: 3, sounds: false, snaps: true, effects: false });
    expect(tidySettings({}).effects).toBe(true);
    expect(tidySettings({ mode: "story" }).mode).toBe("story");
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

import { heSaid, togglePractice, tidyWords, unsay } from "../src/peekaboo/keep";
import { singable, timing, verse } from "../src/peekaboo/song";
import { goodNight, makeBook, pageText, PAGES } from "../src/peekaboo/story";

describe("their own pictures", () => {
  const mine = tidyMine([{ id: "cup1", word: "Cup", category: "things", photo: "data:image/jpeg;base64,x", sound: "Drink!" }, { word: "Dog", category: "animals", photo: "data:image/jpeg;base64,y" }, { word: "No photo", category: "things", photo: "" }, { word: "Bad", category: "zzz", photo: "javascript:x" }]);

  it("keeps only what is safe, and makes pictures of the ones with a photo and a name", () => {
    expect(mine[3]).toMatchObject({ category: "things", photo: "" });
    const things = mineThings(mine);
    expect(things.map((t) => t.word)).toEqual(["Cup", "Dog"]);
    expect(things[0]).toMatchObject({ id: "mine:cup1", say: "Cup! Drink!", category: "things" });
  });

  it("always plays them, and the words being practised, among the few", () => {
    const settings = { ...DEFAULT_SETTINGS, categories: ["animals", "things"] as Settings["categories"], few: true };
    for (let seed = 1; seed < 10; seed++) {
      const ids = inPlay(settings, [], randomFrom(seed), mine, ["animals:owl"]).map((t) => t.id);
      expect(ids).toEqual(expect.arrayContaining(["mine:cup1", "animals:owl"]));
      expect(ids.length).toBe(FEW);
    }
  });

  it("shows a word being practised twice as often", () => {
    const some = THINGS.slice(0, 4);
    const bag = createBag(some, randomFrom(9), [some[0]!.id]);
    const seen = Array.from({ length: 50 }, () => bag.next().id);
    expect(seen.filter((id) => id === some[0]!.id).length).toBe(20);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
});

describe("his words", () => {
  it("keeps the day he first said each, and stops practising it", () => {
    let words = togglePractice(tidyWords(null), "animals:dog");
    expect(words.practice).toEqual(["animals:dog"]);
    words = heSaid(words, "Dog", "animals:dog", 1000);
    words = heSaid(words, "dog", "animals:dog", 2000);
    words = heSaid(words, "  uh-oh ", undefined, 3000);
    expect(words.said).toEqual([{ word: "Dog", id: "animals:dog", at: 1000 }, { word: "uh-oh", at: 3000 }]);
    expect(words.practice).toEqual([]);
    expect(unsay(words, "Dog").said).toHaveLength(1);
    expect(tidyWords({ said: [{ word: "", at: 1 }, { word: "Ball", at: 5 }, "junk"], practice: [1, "x"] })).toEqual({ said: [{ word: "Ball", at: 5 }], practice: ["x"] });
  });
});

describe("Old MacDonald", () => {
  it("sings each animal's own sound, with a or an", () => {
    const cow = verse(thing(cow_)!);
    expect(cow[2]!.text).toBe("And on that farm he had a cow,");
    expect(cow[4]!.text).toBe("With a moo moo here, and a moo moo there,");
    expect(verse(thing("animals:owl")!)[2]!.text).toBe("And on that farm he had an owl,");
    expect(singable(THINGS).every((t) => t.category === "animals" && t.sing)).toBe(true);
    expect(singable(THINGS)).toHaveLength(12);
  });

  it("times each line by its notes", () => {
    const { starts, length } = timing(verse(thing(cow_)!), 100);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(800);
    expect(length).toBe(starts[7]! + 800);
  });
});
const cow_ = "animals:cow";

describe("storytime", () => {
  it("says something fitting on each page, and good night to all", () => {
    expect(pageText(thing(cow_)!)).toBe("Here is the cow. The cow says moo!");
    expect(pageText(thing("vehicles:train")!)).toBe("Here comes the train! Choo choo!");
    expect(pageText(thing("colors:red")!)).toBe("Look at red! Like an apple!");
    expect(pageText(familyThings([{ name: "Grammi", emoji: "👵" }])[0]!)).toBe("Here is Grammi! Hi, Grammi!");
    expect(goodNight([thing(cow_)!, familyThings([{ name: "Mama", emoji: "👩" }])[0]!])).toBe("Good night, cow. Good night, Mama. Good night!");
  });

  it("makes a book of up to eight, family first", () => {
    const family = familyThings([{ name: "Mama", emoji: "👩" }]);
    const book = makeBook([...THINGS, ...family], randomFrom(4));
    expect(book).toHaveLength(PAGES);
    expect(book[0]).toBe(family[0]!.id);
  });

  it("turns pages, reads them only when asked, and ends with good night", () => {
    const settings = DEFAULT_SETTINGS;
    const opened = apply(emptyBoard("story"), { t: "book", pages: [cow_, dog], read: true }, thing, settings);
    expect(opened.state.book).toEqual({ pages: [cow_, dog], page: 0 });
    expect(opened.heard?.text).toBe("Here is the cow. The cow says moo!");
    expect(apply(emptyBoard("story"), { t: "book", pages: [cow_], read: false }, thing, settings).heard).toBeNull();
    const next = apply(opened.state, { t: "page", n: 1, read: false }, thing, settings);
    expect(next.state.book?.page).toBe(1);
    expect(next.heard).toEqual({ text: "", sound: "swish" });
    const night = apply(next.state, { t: "page", n: 9, read: true }, thing, settings);
    expect(night.state.book?.page).toBe(2);
    expect(night.heard?.text).toBe("Good night, cow. Good night, dog. Good night!");
    expect(apply(night.state, { t: "page", n: -3, read: true }, thing, settings).state.book?.page).toBe(0);
  });
});

describe("singing on the board", () => {
  it("sings one verse at a time", () => {
    const settings = DEFAULT_SETTINGS;
    const on = apply(emptyBoard("sing"), { t: "verse", id: cow_, key: 1 }, thing, settings).state;
    expect(on.verse).toEqual({ id: cow_, key: 1 });
    expect(apply(on, { t: "verse", id: dog, key: 2 }, thing, settings).state).toBe(on);
    expect(apply(on, { t: "sung", key: 2 }, thing, settings).state).toBe(on);
    expect(apply(on, { t: "sung", key: 1 }, thing, settings).state.verse).toBeNull();
  });
});

describe("poking a picture", () => {
  it("names it again with a boing, and keeps it on the board longest", () => {
    const settings = DEFAULT_SETTINGS;
    let state = emptyBoard("tap");
    for (const [id, key] of [[cow_, 1], [dog, 2]] as const) state = apply(state, { t: "pop", id, x: 0.5, y: 0.5, key }, thing, settings).state;
    const poked = apply(state, { t: "poke", key: 1 }, thing, settings);
    expect(poked.heard).toEqual({ text: "Cow! Moo!", key: cow_, sound: "boing" });
    expect(poked.state.popped.map((p) => [p.key, p.pokes ?? 0])).toEqual([[2, 0], [1, 1]]);
    expect(apply(poked.state, { t: "poke", key: 99 }, thing, settings).state).toBe(poked.state);
  });
});
