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

  it("strict rules: the top card has to be melded too", () => {
    const t = { ...table({ pile: cards("J♠ 5♥ 9♥") }), rules: strictRummy500 };
    expect(rummy500.apply(t, 0, { type: "take" }).mustUse).not.toBeNull();
    // ...so a top card you can't use can't be taken either.
    expect(() => rummy500.apply({ ...table(), rules: strictRummy500 }, 0, { type: "take" })).toThrow("can't meld the 5♥");
  });

  it("won't let you take a card from deep in the pile that you can't meld (#136)", () => {
    const t = table();
    // The Q♦ goes with nothing in the hand, the cards above it, or the table.
    expect(() => rummy500.apply(t, 0, { type: "take", card: t.pile[2]!.id })).toThrow("can't meld the Q♦");
    // A card that would lay off on a meld on the table is fine.
    const meld = { kind: "run" as const, owner: 1, cards: cards("9♦ 10♦ J♦").map((c) => ({ card: c, by: 1 })) };
    const u = table({ melds: [meld] });
    expect(rummy500.apply(u, 0, { type: "take", card: u.pile[2]!.id }).mustUse).toBe(u.pile[2]!.id);
  });

  it("melding other cards first doesn't take away putting the pile back (#136)", () => {
    const t = table({ hands: [cards("4♠ 5♠ 6♠ 9♦ 9♣"), cards("2♣ 3♣ 8♥")] });
    let s = rummy500.apply(t, 0, { type: "take", card: t.pile[1]!.id });
    s = rummy500.apply(s, 0, { type: "meld", cards: idsOf(s, 0, "4♠ 5♠ 6♠") });
    expect(s.mustUse).not.toBeNull();
    // Putting back now lifts the meld too, and the button says so.
    expect(rummy500.view(s, 0).choices?.options.map((o) => o.label)).toEqual(["Take the turn back"]);
    expect(() => rummy500.apply(s, 0, { type: "discard", cards: idsOf(s, 0, "9♦") })).toThrow("take the turn back");
    const back = rummy500.apply(s, 0, { type: "putback" });
    expect(back.melds).toEqual([]);
    expect(names(back.hands[0]!).sort()).toEqual(["4♠", "5♠", "6♠", "9♣", "9♦"].sort());
    expect(names(back.pile)).toEqual(["J♠", "9♥", "Q♦", "5♥"]);
  });

  it("a table already stuck owing a card with no way back can discard (#136)", () => {
    const s = table({ phase: "meld", hands: [cards("4♠ Q♦ K♥"), cards("2♣")] });
    const stuck = { ...s, mustUse: s.hands[0]![1]!.id, undo: null };
    expect(rummy500.apply(stuck, 0, { type: "discard", cards: [stuck.hands[0]![0]!.id] }).turn).toBe(1);
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

  it("once the pile card is melded there's nothing left to put back", () => {
    const start = table();
    let s = rummy500.apply(start, 0, { type: "take", card: start.pile[1]!.id });
    s = rummy500.apply(s, 0, { type: "meld", cards: idsOf(s, 0, "9♦ 9♣ 9♥") });
    expect(s.mustUse).toBeNull();
    expect(rummy500.view(s, 0).choices).toBeNull();
    expect(() => rummy500.apply(s, 0, { type: "putback" })).toThrow("nothing to put back");
  });

  it("a table saved in the old dead end says so, and can discard and play on", () => {
    // How the bug left it: a card owed from the pile, and no way back.
    const s = table({ phase: "meld", hands: [cards("4♠ Q♦ K♥"), cards("2♣")] });
    const stuck = { ...s, mustUse: s.hands[0]![1]!.id, undo: null };
    expect(rummy500.view(stuck, 0).pick?.prompt).toBe("Pick cards to meld, or one to discard.");
    const on = rummy500.apply(stuck, 0, { type: "discard", cards: [stuck.hands[0]![1]!.id] });
    expect(on.turn).toBe(1);
    expect(on.mustUse).toBeNull();
  });
});
