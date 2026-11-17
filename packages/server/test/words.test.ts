// Word games in the parlor, through the same doors as the rest: a house table of Secret Word
// played to the end by a person who knows only what their view shows, against a computer player;
// nothing of the hidden word in any view until the round is over; and what a watcher sees.
import { compareWords, kitGame, newAnagrams, newSecretWord, plainWords, anagramsSeven, secretFive, type WordView } from "@journey-to-code/games";
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { watchView } from "../src/games.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
});

function setup() {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 1, talk: false });
  open.push(app);
  let cookie = "";
  const send = async (path: string, body?: unknown) => {
    const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return { status: r.status, body: await r.json() };
  };
  return { app, send };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function viewOf(send: ReturnType<typeof setup>["send"], id: string, seat: number): Promise<WordView | undefined> {
  const changes = (await send("/_zb/sync/pull?since=0")).body.changes as { collection: string; key: string; field: string; value: any }[];
  return changes.filter((c) => c.collection === "views" && c.key === `${id}/${seat}` && c.field === "view").at(-1)?.value;
}

/** The letters a view spells out anywhere a player could read them. */
const lettersIn = (v: WordView) => [...v.boards.flatMap((b) => b.rows.map((row) => row.map((t) => t.letter).join(""))), ...v.words.map((w) => w.word), (v.rack ?? []).join("")];

describe("word games in the parlor", () => {
  it("Secret Word: a house table, guessed to the end from the view alone, against a computer player", async () => {
    const { send } = setup();
    await send("/houses", { name: "Word Night", you: "Mikey" });
    const { id } = (await send("/houses/word-night/tables", { game: "secretword", seats: 2 })).body;
    await send(`/rooms/${id}/sit`, { seat: 0, name: "Mikey" });
    await send(`/rooms/${id}/bot`, { seat: 1, name: "Hank" });
    await send(`/rooms/${id}/start`, {});
    // Every view either seat was sent before the end: checked against the word once it is known.
    const seen: WordView[] = [];

    const first = (await viewOf(send, id, 0))!;
    expect(first).toMatchObject({ game: "secretword", seats: 2, me: 0, phase: "playing", turn: null });
    expect(first.entry).toEqual({ type: "guess", prompt: "Guess the word", min: 5, max: 5 });
    // The server says no, in words, to what isn't a word.
    const wrong = await send(`/rooms/${id}/act`, { move: { type: "guess", word: "qqqqq" } });
    expect(wrong.status).not.toBe(200);
    expect(JSON.stringify(wrong.body)).toContain("isn't a word");

    // A person who knows only their view: each guess a plain word that fits every clue so far.
    const tried: { guess: string; tones: string[] }[] = [];
    let last: WordView | undefined;
    for (let i = 0; i < 400; i++) {
      last = await viewOf(send, id, 0);
      if (last?.over) break;
      if (last?.entry) {
        const word = plainWords(5).find((w) => !tried.some((t) => t.guess === w) && tried.every((t) => JSON.stringify(compareWords(t.guess, w)) === JSON.stringify(t.tones)))!;
        expect((await send(`/rooms/${id}/act`, { move: { type: "guess", word } })).status).toBe(200);
        const after = (await viewOf(send, id, 0))!;
        const row = after.boards[0]!.rows[tried.length]!;
        expect(row.map((t) => t.letter).join("")).toBe(word);
        tried.push({ guess: word, tones: row.map((t) => t.tone!) });
        // (A computer player's seat has no view sent anywhere: there is nobody to send it to.)
        if (!after.over) for (const seat of [0, 1]) {
          const v = await viewOf(send, id, seat);
          if (v) seen.push(v);
        }
      } else await sleep(3);
    }
    expect(last?.over?.winners.length).toBeGreaterThan(0);
    expect(last!.words[0]).toMatchObject({ by: null, note: "The word" });
    // Until the round was over, nothing anyone was shown spelt the word, but for the guess that found it.
    const answer = last!.words[0]!.word;
    expect(seen.length).toBeGreaterThan(1);
    for (const v of seen) expect(lettersIn(v).filter((text) => text.includes(answer)).length, JSON.stringify(v.boards)).toBeLessThanOrEqual(v.me === 0 && tried.some((t) => t.guess === answer) ? 1 : 0);
    expect((await send(`/rooms/${id}`)).body.summary).toMatchObject({ game: "secretword", over: true, seats: 2 });
  }, 60_000);

  it("shows a watcher how the guesses went, and nobody's letters", () => {
    const game = kitGame("secretword")!;
    let s = { ...newSecretWord(secretFive, 2, 1), secret: "crane" };
    s = game.apply(s, 0, { type: "guess", word: "trace" });
    s = game.apply(s, 1, { type: "guess", word: "blunt" });
    const watched = watchView("secretword", [game.view(s, 0), game.view(s, 1)]) as WordView;
    expect(watched.boards).toEqual([]);
    expect(watched.keys).toEqual({});
    expect([watched.entry, watched.pick, watched.choices]).toEqual([null, null, null]);
    expect(watched.players.map((p) => p.marks)).toEqual([[["miss", "hit", "hit", "near", "hit"]], [["miss", "miss", "miss", "hit", "miss"]]]);
    expect(JSON.stringify(watched)).not.toMatch(/trace|blunt|crane/);
  });

  it("keeps a word handed in at Anagrams from a watcher until they are all turned over", () => {
    const game = kitGame("anagrams")!;
    let s = { ...newAnagrams(anagramsSeven, 2, 1), rack: [..."eaprtns"], source: "parents" };
    s = game.apply(s, 0, { type: "word", word: "pants" });
    const during = watchView("anagrams", [game.view(s, 0), game.view(s, 1)]) as WordView;
    expect(during.words).toEqual([]);
    expect(during.rack).toEqual([..."eaprtns"]);
    expect(during.players.map((p) => p.line)).toEqual(["Word in", "Thinking"]);
    s = game.apply(s, 1, { type: "word", word: "parent" });
    const after = watchView("anagrams", [game.view(s, 0), game.view(s, 1)]) as WordView;
    expect(after.words.map((w) => w.word)).toEqual(["pants", "parent", "parents"]);
  });

  it("shows a watcher Hangman as the players see it: the word as far as it is uncovered", () => {
    const game = kitGame("hangman")!;
    let s = game.newGame(game.presets[0], 2, 1);
    const letter = (s as { secret: string }).secret[0]!;
    s = game.apply(s, 0, { type: "letter", letter });
    const watched = watchView("hangman", [game.view(s, 0), game.view(s, 1)]) as WordView;
    expect(watched.boards).toHaveLength(1);
    expect(watched.boards[0]!.rows[0]!.some((t) => t.letter === letter)).toBe(true);
    expect(watched.keys[letter]).toBe("hit");
    expect(watched.pick).toBeNull();
  });
});

describe("watching the word games with hidden parts", () => {
  it("keeps a Criss-Crosswords hand from a watcher, and shows the board", () => {
    const game = kitGame("crisscross")!;
    const s = game.newGame(game.presets[0], 2, 1);
    const watched = watchView("crisscross", [game.view(s, 0), game.view(s, 1)]) as WordView;
    expect(watched.hand).toBeNull();
    expect(watched.place).toBeNull();
    expect(watched.boards).toHaveLength(1);
    for (const rack of (s as { racks: string[][] }).racks) expect(JSON.stringify(watched)).not.toContain(JSON.stringify(rack));
  });

  it("shows a watcher the drawing in Draw & Guess, never the word, and no pen", () => {
    const game = kitGame("drawguess")!;
    let s = game.newGame(game.presets[0], 3, 1);
    s = game.apply(s, 0, { type: "choose", index: 0 });
    const stroke = { points: [10, 10, 500, 500], color: 1, size: 0 };
    s = game.apply(s, 0, { type: "stroke", stroke });
    const word = (s as { prompt: string }).prompt;
    const watched = watchView("drawguess", [0, 1, 2].map((seat) => game.view(s, seat))) as WordView;
    expect(watched.canvas).toEqual({ strokes: [stroke], draw: null });
    expect(JSON.stringify(watched)).not.toContain(`"${word}"`);
    expect(watched.boards.flatMap((b) => b.rows.flat()).every((t) => !t.letter)).toBe(true);
  });

  it("keeps Word Hunt's words from a watcher until they are read out", () => {
    const game = kitGame("wordhunt")!;
    let s = game.newGame(game.presets[0], 2, 1);
    const grid = (s as { grid: string }).grid;
    const found = (s as unknown as { found: string[][] }) && game.bot(s, 0, { skill: 1 }, () => 0.5)!;
    s = game.apply(s, 0, found, { elapsed: 0 });
    const watched = watchView("wordhunt", [game.view(s, 0), game.view(s, 1)]) as WordView;
    expect(watched.words).toEqual([]);
    expect(watched.boards[0]!.rows.flat().map((t) => t.letter).join("")).toBe(grid);
  });
});
