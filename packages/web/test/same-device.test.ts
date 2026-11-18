// Several people at one device: which games can be shared, and whose table the screen shows.
import { KIT_GAMES, QUICK_STYLE, kitGame } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { passesDevice, personName, seatAtScreen, seatAtTable, sharesDevice, type SeatSight } from "../src/kit/sameDevice";
import { SECONDS, secondBase } from "../src/second";

const start = (id: string, seats: number, rules?: unknown) => {
  const game = kitGame(id)!;
  return { game, state: game.newGame(game.normalize(rules ?? game.presets[0]), seats, 7) as unknown };
};

describe("sharing a device", () => {
  it("is for games with nothing hidden: boards, dice, table sports and Memory", () => {
    for (const id of ["chess", "checkers", "go", "reversi", "tictactoe", "dropfour", "backgammon", "yacht", "pig", "tenthousand", "shipcaptaincrew", "shutthebox", "memory", "minigolf", "bowling", "billiards", "carrom", "hangman"]) expect(sharesDevice(id), id).toBe(true);
    // A hand of cards, or a fleet, is a secret one screen can't keep.
    for (const id of ["hearts", "gin", "holdem", "combat", "liarsdice", "dominoes", "gofish", "spades", "palace", "skyfire", "secretword", "anagrams"]) expect(sharesDevice(id), id).toBe(false);
    // A game for one has nobody to share with.
    for (const game of KIT_GAMES) if (game.seats.max === 1) expect(sharesDevice(game.id), game.id).toBe(false);
  });

  it("passes a device round for games with hands to hide, but not for races", () => {
    for (const id of ["hearts", "gin", "crazy8", "holdem", "euchre", "combat", "crisscross", "secretword", "liarsdice", "dominoes"]) expect(passesDevice(id), id).toBe(true);
    // Played at once, or against each other's speed.
    for (const id of ["speed", "slapjack", "war", "wordhunt", "drawguess", "mahjongriichi"]) expect(passesDevice(id), id).toBe(false);
    // Shared already (nothing hidden), or for one, or not a kit game.
    for (const id of ["chess", "memory", "klondike", "spades", "skyfire"]) expect(passesDevice(id), id).toBe(false);
  });

  it("passed round, the screen goes to each person in turn (Crazy Eights)", () => {
    const { game, state } = start("crazy8", 2);
    let now = state;
    let at = 0;
    const seen = new Set<number>();
    for (let move = 0; move < 10 && !game.summary(now).over; move++) {
      at = seatAtScreen(game, now, 2, at);
      seen.add(at);
      now = game.apply(now, at, game.bot(now, at, QUICK_STYLE)!);
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });

  it("passed round, Liar's Dice goes to each bidder, and to each person in turn once the cups are up", () => {
    const { game, state } = start("liarsdice", 3);
    let now = state;
    let at = 0;
    const bidders: number[] = [];
    // Three people bid round the table, and then one calls.
    for (let move = 0; move < 3; move++) {
      at = seatAtScreen(game, now, 3, at);
      expect((game.view(now, at) as { turn: number }).turn).toBe(at);
      bidders.push(at);
      now = game.apply(now, at, { type: "bid", count: move + 1, face: 2 });
    }
    expect([...bidders].sort()).toEqual([0, 1, 2]);
    at = seatAtScreen(game, now, 3, at);
    now = game.apply(now, at, { type: "liar" });
    // Everyone looks and moves on, one after another.
    const ready = new Set<number>();
    while ((game.view(now, 0) as { phase: string }).phase === "reveal") {
      at = seatAtScreen(game, now, 3, at);
      expect(ready.has(at)).toBe(false);
      ready.add(at);
      now = game.apply(now, at, { type: "next" });
    }
    expect(ready.size).toBe(3);
  });

  it("shares Mancala on one device, and passes Dominoes round to each player in turn", () => {
    for (const id of ["mancala", "ludo", "chinesecheckers"]) expect(sharesDevice(id), id).toBe(true);
    const { game, state } = start("dominoes", 3);
    let now = state;
    let at = 0;
    const seen = new Set<number>();
    for (let move = 0; move < 12 && !game.summary(now).over; move++) {
      at = seatAtScreen(game, now, 3, at);
      expect((game.view(now, at) as { turn: number }).turn).toBe(at);
      seen.add(at);
      now = game.apply(now, at, game.bot(now, at, QUICK_STYLE)!);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it("names people who gave no name by their seat", () => {
    expect(personName("  Grammi ", 1)).toBe("Grammi");
    expect(personName("", 1)).toBe("Player 2");
    expect(personName(undefined, 2)).toBe("Player 3");
  });

  it("alone, the screen is always yours", () => {
    const { game, state } = start("chess", 2);
    expect(seatAtScreen(game, state, 1, 0)).toBe(0);
  });

  it("turns to whoever is to move, move after move (Chess)", () => {
    const { game, state } = start("chess", 2);
    let now = state;
    let at = 0;
    for (let move = 0; move < 6; move++) {
      at = seatAtScreen(game, now, 2, at);
      expect((game.view(now, at) as { turn: number }).turn).toBe(at);
      now = game.apply(now, at, game.bot(now, at, QUICK_STYLE)!);
    }
  });

  it("stays with the last person while a computer player moves", () => {
    const { game, state } = start("minigolf", 3);
    // Two people and a computer player in seat 2: play until it is the computer's shot.
    let now = state;
    let at = 0;
    for (let shot = 0; shot < 40; shot++) {
      const turn = (game.view(now, at) as { turn: number | null }).turn;
      if (turn === 2) break;
      at = seatAtScreen(game, now, 2, at);
      const move = game.bot(now, at, QUICK_STYLE);
      if (!move) break;
      now = game.apply(now, at, move);
    }
    const view = game.view(now, at) as { turn: number | null; over: unknown };
    if (view.turn === 2 && !view.over) expect(seatAtScreen(game, now, 2, at)).toBe(at);
  });

  it("when everyone may move, lets each person finish before the next takes the device", () => {
    const yacht = kitGame("yacht")!;
    const { game, state } = start("yacht", 2, { ...yacht.presets[0], order: "together" });
    expect((game.view(state, 0) as { turn: number | null }).turn).toBeNull();
    let now = state;
    let at = 0;
    const seen = new Set<number>();
    for (let step = 0; step < 400; step++) {
      const view = game.view(now, at) as { over: unknown };
      if (view.over) break;
      const was = at;
      at = seatAtScreen(game, now, 2, at);
      // Nobody is asked to hand the device over while they still have something to do.
      if (at !== was) expect(game.bot(now, was, QUICK_STYLE), `step ${step}`).toBeNull();
      seen.add(at);
      const move = game.bot(now, at, QUICK_STYLE);
      // The seat the screen shows always has something to do, so the game can't stall on it.
      expect(move, `step ${step}`).not.toBeNull();
      now = game.apply(now, at, move!);
    }
    expect((game.view(now, at) as { over: unknown }).over).toBeTruthy();
    expect([...seen].sort()).toEqual([0, 1]);
  });

  it("plays every shared game to the end with two people and nobody stuck", () => {
    const tables = KIT_GAMES.filter((g) => sharesDevice(g.id)).flatMap((game) => [game.presets[0], ...(game.fields.some((f: { key: string }) => f.key === "order") ? [{ ...game.presets[0], order: "together" }] : [])].map((rules) => ({ game, rules })));
    for (const { game, rules } of tables) {
      let now = game.newGame(game.normalize(rules), Math.max(2, game.seats.min), 11) as unknown;
      let at = 0;
      let over = false;
      for (let step = 0; step < 6000 && !over; step++) {
        at = seatAtScreen(game, now, 2, at);
        const view = game.view(now, at) as { over: unknown; result: unknown };
        if (view.over) {
          over = true;
          break;
        }
        const move = game.bot(now, at, QUICK_STYLE);
        expect(move, `${game.id} step ${step}`).not.toBeNull();
        now = game.apply(now, at, move!);
        // One press moves everyone on after a round, as the table does it.
        if (view.result) {
          try {
            now = game.apply(now, 1 - at, move!);
          } catch {}
        }
      }
      expect(over, game.id).toBe(true);
    }
  }, 120_000);

  // At a table on the server the page has no state, only each seat's own view (RoomTable.tsx).
  it("at a table on the server, goes by the views: to whichever of this device's seats has the move", () => {
    const sight = (me: number, turn: number | null, more: Partial<SeatSight> = {}): SeatSight => ({ me, turn, over: null, result: null, shoot: null, choices: null, ...more });
    // One seat here: always that one.
    expect(seatAtTable({ 0: sight(0, 2) }, [0], 0)).toBe(0);
    // Two here (seats 0 and 2), one elsewhere (seat 1).
    const here = [0, 2];
    expect(seatAtTable({ 0: sight(0, 2), 2: sight(2, 2) }, here, 0)).toBe(2);
    expect(seatAtTable({ 0: sight(0, 0), 2: sight(2, 0) }, here, 2)).toBe(0);
    // Someone on another device is moving: the screen stays where it is.
    expect(seatAtTable({ 0: sight(0, 1), 2: sight(2, 1) }, here, 2)).toBe(2);
    // Everyone may move (Mini Golf with everyone putting at once): finish yours, then the next person's.
    expect(seatAtTable({ 0: sight(0, null, { shoot: {} }), 2: sight(2, null, { shoot: {} }) }, here, 0)).toBe(0);
    expect(seatAtTable({ 0: sight(0, null), 2: sight(2, null, { shoot: {} }) }, here, 0)).toBe(2);
    expect(seatAtTable({ 0: sight(0, null, { choices: { prompt: "", options: [{ label: "Next hole", primary: true }] } }), 2: sight(2, null) }, here, 2)).toBe(0);
    // Someone who has agreed and waits for the other still has a way back, but is not being asked for anything.
    expect(seatAtTable({ 0: sight(0, null, { choices: { prompt: "Waiting for {2} to agree", options: [{ label: "Play on" }] } }), 2: sight(2, null, { choices: { prompt: "", options: [{ label: "Agree", primary: true }] } }) }, here, 0)).toBe(2);
    // Over, or nothing arrived yet: it stays.
    expect(seatAtTable({ 0: sight(0, 2, { over: {} }), 2: sight(2, 2, { over: {} }) }, here, 0)).toBe(0);
    expect(seatAtTable({}, here, 2)).toBe(2);
    // A seat that is no longer this device's is not shown.
    expect(seatAtTable({ 0: sight(0, 0) }, [0], 2)).toBe(0);
  });

  it("plays every shared game to the end from views alone, with two people here and one elsewhere", () => {
    const tables = KIT_GAMES.filter((g) => sharesDevice(g.id)).flatMap((game) => [game.presets[0], ...(game.fields.some((f: { key: string }) => f.key === "order") ? [{ ...game.presets[0], order: "together" }] : [])].map((rules) => ({ game, rules })));
    for (const { game, rules } of tables) {
      // Three seats where the game has them: this device has the first and the last, and the middle one is somebody else's.
      const seats = Math.min(3, game.seats.max);
      const here = seats === 3 ? [0, 2] : [0, 1];
      let now = game.newGame(game.normalize(rules), seats, 11) as unknown;
      let at = 0;
      let over = false;
      for (let step = 0; step < 9000 && !over; step++) {
        // The person elsewhere plays whenever they can.
        if (seats === 3) {
          const theirs = game.bot(now, 1, QUICK_STYLE);
          if (theirs) {
            now = game.apply(now, 1, theirs);
            continue;
          }
        }
        const views = Object.fromEntries(here.map((seat) => [seat, game.view(now, seat) as SeatSight]));
        at = seatAtTable(views, here, at);
        const view = views[at]!;
        if (view.over) {
          over = true;
          break;
        }
        const move = game.bot(now, at, QUICK_STYLE);
        expect(move, `${game.id} step ${step}: the screen is at seat ${at}, which has nothing to do`).not.toBeNull();
        now = game.apply(now, at, move!);
        // One press moves everyone here on after a round, as the table does it.
        if (view.result) {
          for (const other of here) {
            if (other === at) continue;
            try {
              now = game.apply(now, other, move!);
            } catch {}
          }
        }
      }
      expect(over, game.id).toBe(true);
    }
  }, 180_000);

  it("reaches the server as the nth extra person at /second/n, and as itself with no prefix", () => {
    expect(secondBase(0)).toBe("");
    expect(secondBase(1)).toBe("/second/1");
    expect(SECONDS).toBe(3);
  });
});
