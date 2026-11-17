// Several people at one device: which games can be shared, and whose table the screen shows.
import { KIT_GAMES, QUICK_STYLE, kitGame } from "@journey-to-code/games";
import { describe, expect, it } from "vitest";
import { personName, seatAtScreen, sharesDevice } from "../src/kit/sameDevice";

const start = (id: string, seats: number, rules?: unknown) => {
  const game = kitGame(id)!;
  return { game, state: game.newGame(game.normalize(rules ?? game.presets[0]), seats, 7) as unknown };
};

describe("sharing a device", () => {
  it("is for games with nothing hidden: boards, dice, table sports and Memory", () => {
    for (const id of ["chess", "checkers", "go", "reversi", "tictactoe", "dropfour", "backgammon", "yacht", "memory", "minigolf", "bowling", "billiards"]) expect(sharesDevice(id), id).toBe(true);
    // A hand of cards, or a fleet, is a secret one screen can't keep.
    for (const id of ["hearts", "gin", "holdem", "combat", "gofish", "spades", "palace", "skyfire"]) expect(sharesDevice(id), id).toBe(false);
    // A game for one has nobody to share with.
    for (const game of KIT_GAMES) if (game.seats.max === 1) expect(sharesDevice(game.id), game.id).toBe(false);
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
});
