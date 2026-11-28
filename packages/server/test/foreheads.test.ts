// Forehead: the rules (nobody is shown their own card), the host's buzzer, and the rooms.
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { buzz, CARDS, cleanRules, DEFAULT_RULES, ForeheadError, guess, hostAfter, isRight, MODES, newGame, next, pass, pick, plainGuess, reveal, tick, view, type Game } from "../src/forehead-game.js";
import { AWAY_MS, createForeheads, HOST_AWAY_MS, WRONG_TRIES } from "../src/foreheads.js";

const cardOf = (game: Game, seat: number) => CARDS[game.cards[seat]!]!.name;
/** A game with its first round dealt: the host has picked `mode`. */
const start = (seats = [0, 1, 2, 3], rules = DEFAULT_RULES, seed = 7, mode = "classic") => {
  const game = newGame(seats, rules, seed);
  pick(game, game.host, mode, 1000);
  return game;
};

describe("the cards", () => {
  it("each have their own name, and no answer names two of them", () => {
    const answers = CARDS.flatMap((c) => [c.name, ...(c.also ?? [])].map(plainGuess));
    expect(new Set(answers).size).toBe(answers.length);
    expect(CARDS.length).toBeGreaterThan(200);
  });

  it("take a guess however it is typed", () => {
    const officer = CARDS.find((c) => c.name === "Police officer")!;
    expect(isRight(officer, "  a POLICE officer!")).toBe(true);
    expect(isRight(officer, "policeman")).toBe(true);
    expect(isRight(officer, "officer")).toBe(false);
    expect(isRight(CARDS.find((c) => c.name === "Drum")!, "the drums")).toBe(true);
    expect(isRight(CARDS.find((c) => c.name === "The moon")!, "Moon")).toBe(true);
    expect(isRight(CARDS.find((c) => c.name === "Roll of toilet paper")!, "loo roll")).toBe(true);
    expect(isRight(officer, "")).toBe(false);
  });
});

describe("what each player sees", () => {
  it("is everyone's card but their own", () => {
    for (let seed = 1; seed < 40; seed++) {
      const game = start([0, 1, 2, 3, 4], DEFAULT_RULES, seed);
      for (const seat of game.order) {
        const seen = view(game, seat);
        expect(seen.players.find((p) => p.seat === seat)!.card).toBeNull();
        for (const other of seen.players.filter((p) => p.seat !== seat)) expect(other.card).toBe(cardOf(game, other.seat));
        // Not anywhere else in what they are sent, either.
        expect(JSON.stringify(seen)).not.toContain(JSON.stringify(cardOf(game, seat)));
      }
    }
  });

  it("deals everyone a different card, and none twice in a game", () => {
    const game = start([0, 1, 2], { rounds: 10, seconds: 60, guesses: 1 });
    const dealt: string[] = [];
    for (let round = 1; round <= 10; round++) {
      dealt.push(...game.order.map((s) => cardOf(game, s)));
      reveal(game, game.host, 1000);
      next(game, game.host);
      if (round < 10) pick(game, game.host, "classic", 1000);
    }
    expect(new Set(dealt).size).toBe(30);
    expect(game.phase).toBe("over");
  });

  it("shows nobody's card to someone who isn't playing, until the cards are turned over", () => {
    const game = start();
    expect(view(game, null).players.every((p) => p.card === null)).toBe(true);
    expect(view(game, 9).players.every((p) => p.card === null)).toBe(true);
    reveal(game, game.host, 1000);
    expect(view(game, null).players.map((p) => p.card)).toEqual(game.order.map((s) => cardOf(game, s)));
    expect(view(game, 2).players.find((p) => p.seat === 2)!.card).toBe(cardOf(game, 2));
  });

  it("shows a player their own card once they have guessed it", () => {
    const game = start();
    expect(guess(game, 1, cardOf(game, 1), 2000)).toEqual({ right: true });
    expect(view(game, 1).players.find((p) => p.seat === 1)!.card).toBe(cardOf(game, 1));
    expect(view(game, 2).players.find((p) => p.seat === 2)!.card).toBeNull();
  });
});

describe("guessing", () => {
  it("is worth the guesses that were left", () => {
    const game = start();
    expect(guess(game, 0, "a teapot, surely", 2000)).toEqual({ right: false });
    guess(game, 0, cardOf(game, 0), 2000);
    guess(game, 1, cardOf(game, 1), 2000);
    expect(game.scores).toMatchObject({ 0: 2, 1: 3, 2: 0 });
    expect(() => guess(game, 0, "again", 2000)).toThrow("already");
    expect(view(game, 3).players[0]!.guesses).toEqual([{ text: "a teapot, surely", right: false }, { text: cardOf(game, 0), right: true }]);
  });

  it("runs out, and the round ends when everyone is done", () => {
    const game = start([0, 1, 2], { rounds: 2, seconds: 60, guesses: 2 });
    guess(game, 0, "nope", 2000);
    guess(game, 0, "still nope", 2000);
    expect(() => guess(game, 0, "one more", 2000)).toThrow("out of guesses");
    guess(game, 1, cardOf(game, 1), 2000);
    expect(game.phase).toBe("playing");
    guess(game, 2, cardOf(game, 2), 2000);
    expect(game.phase).toBe("reveal");
    expect(() => guess(game, 2, "late", 2000)).toThrow("over");
  });

  it("ends on the clock", () => {
    const game = start();
    expect(tick(game, 1000 + 179_000)).toBe(false);
    expect(tick(game, 1000 + 180_000)).toBe(true);
    expect(game.phase).toBe("reveal");
    expect(() => guess(game, 1, cardOf(game, 1), 1000 + 180_001)).toThrow(ForeheadError);
  });

  it("refuses an empty guess without spending one", () => {
    const game = start();
    expect(() => guess(game, 0, "  the ", 2000)).toThrow("Type who");
    expect(view(game, 0).players[0]!.guessesLeft).toBe(3);
  });
});

describe("the host's buzzer", () => {
  it("costs the player who said a card a point", () => {
    const game = start();
    const entry = buzz(game, 0, 2, undefined, 2000);
    expect(entry).toEqual({ n: 1, round: 1, by: 0, seat: 2, redealt: null });
    expect(game.scores[2]).toBe(-1);
    expect(view(game, 3).buzzes).toEqual([entry]);
  });

  it("is the host's alone, for another player, while a round is on", () => {
    const game = start();
    expect(() => buzz(game, 1, 2, undefined, 2000)).toThrow("Only the host");
    expect(() => buzz(game, 0, 0, undefined, 2000)).toThrow("yourself");
    expect(() => buzz(game, 0, 7, undefined, 2000)).toThrow("one of the players");
    expect(() => buzz(game, 0, 2, 2, 2000)).toThrow("their own card");
    reveal(game, 0, 2000);
    expect(() => buzz(game, 0, 2, undefined, 2000)).toThrow("while a round");
    expect(game.scores[2]).toBe(0);
  });

  it("deals a new card to the player whose card was said, whom it still isn't shown to", () => {
    const game = start();
    const before = cardOf(game, 3);
    expect(buzz(game, 0, 2, 3, 2000).redealt).toBe(3);
    expect(cardOf(game, 3)).not.toBe(before);
    expect(isRight(CARDS[game.cards[3]!]!, before)).toBe(false);
    expect(JSON.stringify(view(game, 3))).not.toContain(JSON.stringify(cardOf(game, 3)));
    expect(view(game, 1).players.find((p) => p.seat === 3)!.card).toBe(cardOf(game, 3));
    // The host's own card can be the one given away: the host is wearing one too.
    const hosts = cardOf(game, 0);
    expect(buzz(game, 0, 1, 0, 2000).redealt).toBe(0);
    expect(cardOf(game, 0)).not.toBe(hosts);
    expect(JSON.stringify(view(game, 0))).not.toContain(JSON.stringify(cardOf(game, 0)));
  });

  it("leaves a card alone that was already guessed", () => {
    const game = start();
    guess(game, 3, cardOf(game, 3), 2000);
    const card = cardOf(game, 3);
    expect(buzz(game, 0, 2, 3, 2000).redealt).toBeNull();
    expect(cardOf(game, 3)).toBe(card);
    expect(game.scores[2]).toBe(-1);
  });
});

describe("the host", () => {
  it("changes each round, and the game ends after the last", () => {
    const game = start([0, 1, 2], { rounds: 3, seconds: 60, guesses: 3 });
    expect(() => next(game, 0)).toThrow("isn't over");
    reveal(game, 0, 2000);
    expect(() => next(game, 1)).toThrow("Only the host");
    next(game, 0);
    // The new host picks the round's game before anything is dealt.
    expect(game).toMatchObject({ round: 2, host: 1, phase: "picking", cards: {} });
    expect(() => pick(game, 0, "classic", 5000)).toThrow("host picks");
    expect(() => pick(game, 1, "charades", 5000)).toThrow("on the list");
    expect(() => guess(game, 2, "a goose", 5000)).toThrow("aren't dealt");
    pick(game, 1, "opposites", 5000);
    expect(game).toMatchObject({ phase: "playing", mode: "opposites", endsAt: 65_000 });
    expect(() => pick(game, 1, "classic", 5000)).toThrow("already picked");
    expect(() => reveal(game, 0, 5000)).toThrow("Only the host");
    reveal(game, 1, 5000);
    next(game, 1);
    expect(game.host).toBe(2);
    pick(game, 2, "classic", 5000);
    guess(game, 0, cardOf(game, 0), 5000);
    reveal(game, 2, 5000);
    next(game, 2);
    expect(game.phase).toBe("over");
    expect(view(game, 1).winners).toEqual([0]);
  });

  it("skips someone who has dropped off the call", () => {
    const game = start();
    expect(hostAfter(game, 0)).toBe(1);
    expect(hostAfter(game, 0, (s) => s === 1)).toBe(2);
    expect(hostAfter(game, 3, (s) => s !== 3)).toBe(3);
  });

  it("needs three to play and takes no more than six", () => {
    expect(() => newGame([0, 1], DEFAULT_RULES, 1)).toThrow("takes 3");
    expect(() => newGame([0, 1, 2, 3, 4, 5, 6], DEFAULT_RULES, 1)).toThrow("No more than 6");
    expect(cleanRules({ rounds: 99, seconds: 120, guesses: "x" })).toEqual({ rounds: 3, seconds: 120, guesses: 3 });
  });
});

describe("the games a host picks from", () => {
  it("are on a list every seat is sent, each with its rule", () => {
    const game = newGame([0, 1, 2], DEFAULT_RULES, 3);
    const seen = view(game, 1);
    expect(seen).toMatchObject({ phase: "picking", mode: null, asker: null, silent: false });
    expect(seen.modes.map((m) => m.id)).toEqual(["classic", "questions", "silent", "hotseat", "opposites", "oneword"]);
    expect(MODES.every((m) => m.name && m.rule.length > 20)).toBe(true);
    expect(seen.players.every((p) => !p.wearing && p.card === null)).toBe(true);
    pick(game, 0, "oneword", 1000);
    expect(view(game, 1).mode).toMatchObject({ id: "oneword", name: "One word" });
  });

  it("switch every microphone off for a silent room, until the cards turn over", () => {
    const game = start([0, 1, 2], DEFAULT_RULES, 7, "silent");
    expect(view(game, 2).silent).toBe(true);
    reveal(game, 0, 2000);
    expect(view(game, 2).silent).toBe(false);
  });

  it("take turns asking, in Yes or no: the turn passes on a guess, a pass, or the host's say", () => {
    const game = start([0, 1, 2, 3], DEFAULT_RULES, 7, "questions");
    expect(view(game, 0).asker).toBe(1);
    expect(() => pass(game, 2, 2000)).toThrow("isn't your turn");
    pass(game, 1, 2000);
    expect(game.asker).toBe(2);
    pass(game, 0, 2000); // the host moves a slow one along
    expect(game.asker).toBe(3);
    guess(game, 3, "a wrong one", 2000);
    expect(game.asker).toBe(0);
    // Someone who has got theirs is skipped, and anyone may still guess out of turn.
    guess(game, 1, cardOf(game, 1), 2000);
    expect(game.asker).toBe(0);
    pass(game, 0, 2000);
    expect(game.asker).toBe(2);
    reveal(game, 0, 2000);
    expect(view(game, 0).asker).toBeNull();
    expect(() => pass(game, 0, 2000)).toThrow("taking turns");
  });

  it("put one player in the hot seat, a different one each time", () => {
    const game = newGame([0, 1, 2], { rounds: 4, seconds: 60, guesses: 2 }, 5);
    const sat: number[] = [];
    for (let round = 1; round <= 4; round++) {
      pick(game, game.host, "hotseat", 1000);
      const wearers = view(game, null).players.filter((p) => p.wearing).map((p) => p.seat);
      expect(wearers).toHaveLength(1);
      const one = wearers[0]!;
      sat.push(one);
      const other = game.order.find((s) => s !== one)!;
      expect(view(game, other).players.find((p) => p.seat === one)!.card).toBe(cardOf(game, one));
      expect(view(game, one).players.find((p) => p.seat === one)!.card).toBeNull();
      expect(() => guess(game, other, "me?", 2000)).toThrow("you're the room");
      if (other !== game.host && one !== game.host) expect(() => buzz(game, game.host, one, other, 2000)).toThrow("isn't wearing");
      // The round is over as soon as the one wearing a card is done.
      guess(game, one, cardOf(game, one), 2000);
      expect(game.phase).toBe("reveal");
      next(game, game.host);
    }
    expect(new Set(sat.slice(0, 3)).size).toBe(3);
    expect(game.phase).toBe("over");
  });
});

const BASE = "http://test";
type Ticket = { code: string; seat: number; token: string };

function parlor(options: Parameters<typeof createForeheads>[0] = {}) {
  const rooms = createForeheads({ longPoll: 30, ice: [{ urls: "stun:example.test" }], seed: () => 11, ...options });
  const ask = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = (await rooms.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined })))!;
    return { status: r.status, body: (await r.json()) as Record<string, any> };
  };
  const open = async (names: string[]) => {
    const first = (await ask("/foreheads", { name: names[0] })).body as Ticket;
    const rest: Ticket[] = [];
    for (const name of names.slice(1)) rest.push((await ask(`/foreheads/${first.code}/join`, { name })).body as Ticket);
    return [first, ...rest];
  };
  const act = (who: Ticket, action: string, more: object = {}) => ask(`/foreheads/${who.code}/do`, { seat: who.seat, token: who.token, action, ...more });
  const see = async (who: Ticket) => (await ask(`/foreheads/${who.code}/hear?seat=${who.seat}&token=${who.token}&after=0&v=0`)).body.view;
  return { rooms, ask, open, act, see };
}

describe("a room", () => {
  it("seats people from its link, and tells everyone as they sit", async () => {
    const { ask, open, see } = parlor();
    const [mikey, grammi] = await open(["Mikey", "Grammi"]);
    expect(mikey!.code).toMatch(/^[a-z2-9]{6}$/);
    expect((mikey as any).ice).toEqual([{ urls: "stun:example.test" }]);
    const view = await see(mikey!);
    expect(view).toMatchObject({ you: 0, host: 0, canStart: false, game: null, players: [{ seat: 0, name: "Mikey", here: true }, { seat: 1, name: "Grammi", here: true }] });
    // Waiting with the latest in hand: woken by the next person sitting down.
    const waiting = ask(`/foreheads/${mikey!.code}/hear?seat=0&token=${mikey!.token}&after=0&v=${(await ask(`/foreheads/${mikey!.code}/hear?seat=0&token=${mikey!.token}&v=0`)).body.v}`);
    const delbie = (await ask(`/foreheads/${mikey!.code}/join`, { name: "grammi" })).body;
    expect((await waiting).body.view.players.map((p: any) => p.name)).toEqual(["Mikey", "Grammi", "grammi 2"]);
    expect(delbie.view.canStart).toBe(true);
    expect((await see(grammi!)).you).toBe(1);
  });

  it("plays a game through the server, each seat sent everyone's card but its own", async () => {
    const { open, act, see } = parlor();
    const [a, b, c] = (await open(["A", "B", "C"])) as [Ticket, Ticket, Ticket];
    expect((await act(b, "start")).status).toBe(400);
    expect((await act(a, "rules", { rules: { rounds: 2 } })).body.view.rules.rounds).toBe(2);
    expect((await act(a, "start")).body.view.game).toMatchObject({ phase: "picking", host: 0 });
    expect((await act(b, "pick", { mode: "classic" })).body.error).toMatch(/host picks/);
    expect((await act(a, "pick", { mode: "classic" })).body.view.game.mode.id).toBe("classic");

    const views = { a: await see(a), b: await see(b), c: await see(c) };
    const cards = { a: views.b.game.players[0].card, b: views.a.game.players[1].card, c: views.a.game.players[2].card };
    expect(views.a.game.players[0].card).toBeNull();
    expect(views.b.game.players[1].card).toBeNull();
    expect(views.c.game.players[2].card).toBeNull();
    expect(views.c.game.players[0].card).toBe(cards.a);
    expect(JSON.stringify(views.a)).not.toContain(JSON.stringify(cards.a));

    // The host buzzes B for saying C's card: B is a point down and C has a new card.
    expect((await act(b, "buzz", { player: 2 })).body.error).toMatch(/Only the host/);
    const buzzed = (await act(a, "buzz", { player: 1, spoiled: 2 })).body.view;
    expect(buzzed.game.buzzes).toEqual([{ n: 1, round: 1, by: 0, seat: 1, redealt: 2 }]);
    expect(buzzed.game.players[1].score).toBe(-1);
    expect(buzzed.game.players[2].card).not.toBe(cards.c);
    expect((await see(c)).game.players[2].card).toBeNull();

    expect((await act(b, "guess", { text: cards.b })).body.view.game.players[1]).toMatchObject({ won: 3, score: 2, card: cards.b });
    expect((await act(c, "guess", { text: "no idea" })).body.view.game.players[2]).toMatchObject({ won: null, guessesLeft: 2, card: null });
    expect((await act(a, "reveal")).body.view.game.phase).toBe("reveal");
    expect((await see(c)).game.players[2].card).toBe(buzzed.game.players[2].card);

    // The next round is the next player's to host.
    expect((await act(b, "next")).status).toBe(400);
    expect((await act(a, "next")).body.view.game).toMatchObject({ round: 2, host: 1, phase: "picking" });
    expect((await act(b, "pick", { mode: "questions" })).body.view.game).toMatchObject({ phase: "playing", asker: 2 });
    expect((await act(a, "pass")).body.error).toMatch(/isn't your turn/);
    expect((await act(c, "pass")).body.view.game.asker).toBe(0);
    expect((await act(a, "buzz", { player: 2 })).status).toBe(400);
    expect((await act(b, "buzz", { player: 0 })).status).toBe(200);
    await act(b, "reveal");
    expect((await act(b, "next")).body.view.game).toMatchObject({ phase: "over", winners: [1] });
    // And again, with whoever is next hosting.
    expect((await act(b, "again")).body.view.game).toMatchObject({ round: 1, host: 2, phase: "picking" });
  });

  it("lets nobody in once the game has started, but a player back to their own seat", async () => {
    const { ask, open, act } = parlor();
    const [a, b] = (await open(["A", "B", "C"])) as [Ticket, Ticket];
    await act(a, "start");
    await act(a, "pick", { mode: "classic" });
    await ask(`/foreheads/${a.code}/say`, { seat: 0, token: a.token, to: 1, message: { type: "offer" } });
    expect((await ask(`/foreheads/${a.code}/join`, { name: "Late" })).status).toBe(409);
    const back = await ask(`/foreheads/${a.code}/join`, { seat: b.seat, token: b.token });
    expect(back.body).toMatchObject({ seat: 1, token: b.token });
    expect(back.body.view.game.players[1].card).toBeNull();
    // Their box starts empty again: what was in it was for a page that is gone.
    expect((await ask(`/foreheads/${a.code}/hear?seat=1&token=${b.token}&after=0&v=${back.body.v}`)).body.messages).toEqual([]);
    expect((await ask(`/foreheads/${a.code}/join`, { seat: b.seat, token: "guessed" })).status).toBe(409);
  });

  it("turns the cards over when the time is up, and hands the game on from a host who has gone", async () => {
    let clock = 0;
    const { open, act, see } = parlor({ now: () => clock });
    const [a, b, c] = (await open(["A", "B", "C"])) as [Ticket, Ticket, Ticket];
    await act(a, "start");
    await act(a, "pick", { mode: "silent" });
    expect((await see(b)).game.silent).toBe(true);
    clock += AWAY_MS + 1;
    // B and C are still asking; A isn't.
    await see(c);
    expect((await see(b)).players.map((p: any) => p.here)).toEqual([false, true, true]);
    expect((await see(c)).game.host).toBe(0);
    clock += HOST_AWAY_MS;
    await see(b);
    expect((await see(c)).game.host).toBe(1);
    expect((await act(b, "buzz", { player: 2 })).status).toBe(200);
    clock += 180_000;
    expect((await see(c)).game).toMatchObject({ phase: "reveal", silent: false });
  });

  it("hands the picking on, too, from a host who has gone", async () => {
    let clock = 0;
    const { open, act, see } = parlor({ now: () => clock });
    const [a, b, c] = (await open(["A", "B", "C"])) as [Ticket, Ticket, Ticket];
    await act(a, "start");
    clock += AWAY_MS + HOST_AWAY_MS + 1;
    await see(b);
    expect((await see(c)).game).toMatchObject({ phase: "picking", host: 1 });
    expect((await act(b, "pick", { mode: "hotseat" })).body.view.game.players.filter((p: any) => p.wearing)).toHaveLength(1);
  });

  it("gives up a seat before the game, and keeps it during one", async () => {
    const { open, act, see, rooms } = parlor();
    const [a, b, c, d] = (await open(["A", "B", "C", "D"])) as [Ticket, Ticket, Ticket, Ticket];
    await act(a, "leave");
    const lobby = await see(b);
    expect(lobby.players.map((p: any) => p.seat)).toEqual([1, 2, 3]);
    expect(lobby.host).toBe(1);
    await act(b, "start");
    await act(d, "leave");
    expect((await see(c)).game.players.map((p: any) => p.seat)).toEqual([1, 2, 3]);
    await act(b, "leave");
    await act(c, "leave");
    expect(rooms.size).toBe(1);
  });

  it("carries a handshake to the seat it is for, and to nobody else", async () => {
    const { ask, open } = parlor();
    const [a, b, c] = (await open(["A", "B", "C"])) as [Ticket, Ticket, Ticket];
    const hear = (who: Ticket, after = 0) => ask(`/foreheads/${who.code}/hear?seat=${who.seat}&token=${who.token}&after=${after}&v=0`);
    expect((await ask(`/foreheads/${a.code}/say`, { seat: 0, token: a.token, to: 1, message: { type: "offer", sdp: "v=0" } })).status).toBe(200);
    expect((await hear(b)).body.messages).toEqual([{ from: 0, message: { type: "offer", sdp: "v=0" } }]);
    expect((await hear(c)).body.messages).toEqual([]);
    expect((await ask(`/foreheads/${a.code}/say`, { seat: 0, token: "nope", to: 1, message: 1 })).status).toBe(403);
    expect((await ask(`/foreheads/${a.code}/say`, { seat: 0, token: a.token, to: 0, message: 1 })).status).toBe(404);
    expect((await ask(`/foreheads/${a.code}/hear?seat=1&token=${a.token}`)).status).toBe(403);
    expect((await ask(`/foreheads/${a.code}/say`, { seat: 0, token: a.token, to: 1, message: "x".repeat(20_000) })).status).toBe(413);
  });

  it("makes someone guessing codes wait, and forgets a room nobody has asked about for an hour", async () => {
    let clock = 0;
    const { ask, rooms } = parlor({ now: () => clock });
    const { code } = (await ask("/foreheads", { name: "A" })).body;
    for (let i = 0; i < WRONG_TRIES; i++) expect((await ask(`/foreheads/wrong${i}/join`, {}, { "x-forwarded-for": "1.2.3.4" })).status).toBe(404);
    expect((await ask("/foreheads/wrongmore/join", {}, { "x-forwarded-for": "1.2.3.4" })).status).toBe(429);
    expect(rooms.size).toBe(1);
    clock += 61 * 60_000;
    expect((await ask(`/foreheads/${code}/join`, { name: "B" })).status).toBe(404);
    expect(rooms.size).toBe(0);
  });
});

describe("in the parlor", () => {
  let open: ReturnType<typeof createCardRoom>[] = [];
  afterEach(() => {
    open.forEach((a) => a.close());
    open = [];
  });

  it("is answered by the parlor's server, with the calls' ICE servers", async () => {
    const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 50, talk: false, calls: { ice: [{ urls: "turn:example.test", username: "u", credential: "c" }] } });
    open.push(app);
    const r = (await app.fetch(new Request(`${BASE}/foreheads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Mikey" }) })))!;
    expect(r.status).toBe(201);
    expect(((await r.json()) as any).ice).toEqual([{ urls: "turn:example.test", username: "u", credential: "c" }]);
  });
});
