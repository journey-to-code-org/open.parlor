import { describe, expect, it } from "vitest";
import { classicRummy500, meldKind, newRummy500, placement, rummy500, strictRummy500, type KCard, type Rummy500State } from "../src/index.js";

let n = 0;
const card = (id: string): KCard => {
  const rank = { J: 11, Q: 12, K: 13, A: 14 }[id.slice(0, -1)] ?? Number(id.slice(0, -1));
  const suit = { "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs" }[id.slice(-1)]!;
  return { kind: "pip", rank, suit, id: `${id}#${n++}` } as KCard;
};
const cards = (ids: string) => (ids ? ids.split(" ").map(card) : []);
const names = (cs: KCard[]) => cs.map((c) => c.id.split("#")[0]);
const idsOf = (s: Rummy500State, seat: number, want: string) => want.split(" ").map((w) => s.hands[seat]!.find((c) => c.id.startsWith(w + "#"))!.id);

function table(over: Partial<Rummy500State> = {}): Rummy500State {
  const s = newRummy500(classicRummy500, 2, 1);
  return { ...s, turn: 0, phase: "draw", hands: [cards("4♠ 9♦ 9♣ K♥"), cards("2♣ 3♣ 8♥")], stock: cards("5♣ 6♣ 7♣"), pile: cards("J♠ 9♥ Q♦ 5♥"), melds: [], mustUse: null, undo: null, ...over };
}

describe("Rummy 500", () => {
  it("deals 13 each to two players, 7 to more", () => {
    expect(newRummy500(classicRummy500, 2, 3).hands.map((h) => h.length)).toEqual([13, 13]);
    expect(newRummy500(classicRummy500, 4, 3).hands.map((h) => h.length)).toEqual([7, 7, 7, 7]);
  });

  it("sets and runs, with the ace low in A 2 3 or high in Q K A, never around the corner", () => {
    expect(meldKind(cards("9♦ 9♣ 9♥"))).toBe("set");
    expect(meldKind(cards("5♥ 6♥ 7♥ 8♥"))).toBe("run");
    expect(meldKind(cards("A♥ 2♥ 3♥"))).toBe("run");
    expect(meldKind(cards("Q♥ K♥ A♥"))).toBe("run");
    expect(meldKind(cards("K♥ A♥ 2♥"))).toBeNull();
    expect(meldKind(cards("5♥ 6♥ 7♣"))).toBeNull();
  });

  it("taking from deep in the pile takes every card above it, and the deep card must be melded", () => {
    let s = rummy500.apply(table(), 0, { type: "take" });
    // The top card alone: no obligation on the classic rules.
    expect(names(s.pile)).toEqual(["J♠", "9♥", "Q♦"]);
    expect(s.mustUse).toBeNull();
    const t = table();
    s = rummy500.apply(t, 0, { type: "take", card: t.pile[1]!.id });
    expect(names(s.pile)).toEqual(["J♠"]);
    expect(s.hands[0]!.length).toBe(7);
    expect(() => rummy500.apply(s, 0, { type: "discard", cards: [idsOf(s, 0, "4♠")[0]!] })).toThrow("meld it this turn");
    const back = rummy500.apply(s, 0, { type: "putback" });
    expect(names(back.pile)).toEqual(["J♠", "9♥", "Q♦", "5♥"]);
    expect(back.phase).toBe("draw");
    // Put back: that card can't be taken again this turn; another one can.
    expect(() => rummy500.apply(back, 0, { type: "take", card: back.pile[1]!.id })).toThrow("put that one back");
    expect(rummy500.apply(back, 0, { type: "take" }).phase).toBe("meld");
    s = rummy500.apply(s, 0, { type: "meld", cards: idsOf(s, 0, "9♦ 9♣ 9♥") });
    expect(s.mustUse).toBeNull();
    expect(rummy500.apply(s, 0, { type: "discard", cards: idsOf(s, 0, "4♠") }).turn).toBe(1);
  });

  it("never leaves a player stuck owing a card from the pile (issue #120)", () => {
    // 7♥ is deep in the pile. With 7♣ 7♦ in hand it makes a set of sevens; but 7♣ also runs 5♣ 6♣ 7♣.
    const start = table({ hands: [cards("5♣ 6♣ 7♣ 7♦ K♠ 2♥"), cards("2♣ 3♣ 8♥")], pile: cards("J♠ 7♥ Q♦") });
    const s = rummy500.apply(start, 0, { type: "take", card: start.pile[1]!.id });
    const owed = s.mustUse!;
    expect(owed).toMatch(/^7♥/);
    // Melding the clubs run first would use the 7♣ and leave the 7♥ nowhere to go: refused, with a reason.
    expect(() => rummy500.apply(structuredClone(s), 0, { type: "meld", cards: idsOf(s, 0, "5♣ 6♣ 7♣") })).toThrow(/7♥/);
    // Melding the 7♥ first, or something that leaves it a home, is fine.
    const sevens = rummy500.apply(structuredClone(s), 0, { type: "meld", cards: idsOf(s, 0, "7♣ 7♦ 7♥") });
    expect(sevens.mustUse).toBeNull();
    expect(rummy500.apply(sevens, 0, { type: "discard", cards: idsOf(sevens, 0, "K♠") }).phase).toBe("draw");

    // A table already stuck this way (from before this fix) can discard and go on.
    const already = structuredClone(s);
    already.melds.push({ kind: "run", owner: 0, cards: [already.hands[0]!.find((c) => c.id.startsWith("5♣"))!, already.hands[0]!.find((c) => c.id.startsWith("6♣"))!, already.hands[0]!.find((c) => c.id.startsWith("7♣"))!].map((card) => ({ card, by: 0 })) });
    already.hands[0] = already.hands[0]!.filter((c) => !/^[567]♣/.test(c.id));
    already.undo = null;
    const view = rummy500.view(already, 0);
    expect(view.pick?.prompt).not.toMatch(/Meld the/);
    const on = rummy500.apply(already, 0, { type: "discard", cards: idsOf(already, 0, "K♠") });
    expect(on).toMatchObject({ phase: "draw", turn: 1, mustUse: null });
    // And the computer gets itself out of it the same way, rather than asking to put back what it can't.
    const bot = rummy500.bot!(structuredClone({ ...already }), 0, "Bea", { skill: 1 } as never);
    expect(bot?.type).not.toBe("putback");
  });

  it("strict rules: the top card has to be melded too", () => {
    const t = { ...table(), rules: strictRummy500 };
    expect(rummy500.apply(t, 0, { type: "take" }).mustUse).not.toBeNull();
  });

  it("lay off on anyone's meld, and the cards score for whoever laid them", () => {
    const meld = { kind: "run" as const, owner: 1, cards: cards("5♣ 6♣ 7♣").map((c) => ({ card: c, by: 1 })) };
    const s = table({ phase: "meld", hands: [cards("8♣ 4♥ K♥"), cards("2♦")], melds: [meld] });
    expect(placement(s, [s.hands[0]![0]!])).toEqual({ kind: "run", onto: 0 });
    const after = rummy500.apply(s, 0, { type: "meld", cards: [s.hands[0]![0]!.id] });
    expect(after.melds[0]!.cards.map((x) => x.by)).toEqual([1, 1, 1, 0]);
  });

  it("going out scores melded cards less cards in hand; ace is 1 at the bottom of a run", () => {
    const melds = [
      { kind: "run" as const, owner: 0, cards: cards("A♥ 2♥ 3♥").map((c) => ({ card: c, by: 0 })) },
      { kind: "set" as const, owner: 1, cards: cards("K♠ K♦ K♣").map((c) => ({ card: c, by: 1 })) },
    ];
    const s = table({ phase: "meld", hands: [cards("A♠"), cards("Q♣ 5♦")], melds, scores: [0, 0] });
    const done = rummy500.apply(s, 0, { type: "discard", cards: [s.hands[0]![0]!.id] });
    expect(done.lastHand).toEqual({ melded: [1 + 2 + 3, 30], inHand: [0, 15], out: 0 });
    expect(done.scores).toEqual([6, 15]);
  });

  it("the hand ends when the stock runs out", () => {
    const s = table({ phase: "meld", stock: [], hands: [cards("4♠ 9♦"), cards("2♣")] });
    const done = rummy500.apply(s, 0, { type: "discard", cards: [s.hands[0]![0]!.id] });
    expect(done.phase).toBe("scored");
    expect(done.lastHand!.out).toBeNull();
  });

  it("a player taking deep and melding in any order is never left without a move", () => {
    // A careless player: takes from deep in the pile often, melds whatever it can in any order.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const tryMove = (st: Rummy500State, move: Parameters<typeof rummy500.apply>[2]) => {
      try {
        return rummy500.apply(structuredClone(st), 0, move);
      } catch {
        return null;
      }
    };
    let checked = 0;
    for (let game = 0; game < 120; game++) {
      let st = newRummy500(classicRummy500, 3, game + 1);
      for (let step = 0; step < 400 && st.phase !== "finished" && st.phase !== "scored"; step++) {
        if (st.turn !== 0) {
          st = rummy500.apply(st, st.turn, rummy500.bot!(st, st.turn, "Bot", { skill: 1 } as never)!);
          continue;
        }
        const hand = st.hands[0]!;
        if (st.phase === "draw") {
          const at = st.pile.length > 1 && rand() < 0.6 ? Math.floor(rand() * st.pile.length) : -1;
          st = (at >= 0 && tryMove(st, { type: "take", card: st.pile[at]!.id })) || rummy500.apply(st, 0, st.stock.length ? { type: "draw" } : { type: "take" });
          continue;
        }
        // Every move open to the player now: put back, any discard, any meld of up to four cards.
        const options: Parameters<typeof rummy500.apply>[2][] = [{ type: "putback" }, ...hand.map((c) => ({ type: "discard" as const, cards: [c.id] }))];
        for (let a = 0; a < hand.length; a++)
          for (let b = a; b < hand.length; b++)
            for (let c = b; c < hand.length; c++) {
              const pick = [...new Set([hand[a]!.id, hand[b]!.id, hand[c]!.id])];
              if (placement(st, pick.map((id) => hand.find((x) => x.id === id)!))) options.push({ type: "meld", cards: pick });
            }
        const open = options.map((m) => [m, tryMove(st, m)] as const).filter(([, after]) => after);
        checked++;
        expect(open.length, `stuck: ${JSON.stringify({ hand: hand.map((c) => c.id), mustUse: st.mustUse, undo: !!st.undo })}`).toBeGreaterThan(0);
        // Prefer melding (in any order, owed card or not), then anything.
        const melds = open.filter(([m]) => m.type === "meld");
        const [, next] = (melds.length && rand() < 0.7 ? melds : open)[Math.floor(rand() * (melds.length && rand() < 0.7 ? melds.length : open.length))] ?? open[0]!;
        st = next!;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});
