import { beforeEach, describe, expect, it } from "vitest";
import { addGame, harder, loadRecord, recordLine } from "../src/record";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
});

describe("your record", () => {
  it("counts games, wins and runs of wins", () => {
    addGame("chess", true, "easy");
    addGame("chess", true, "easy");
    addGame("chess", false, "easy");
    const r = addGame("chess", true, "easy");
    expect(r).toMatchObject({ played: 4, won: 3, streak: 1, best: 2 });
    expect(recordLine(r)).toBe("Won 3 of 4 · best run 2");
    expect(loadRecord("hearts").played).toBe(0);
  });
  it("offers a harder table after three wins in a row against the same", () => {
    for (let i = 0; i < 2; i++) addGame("hearts", true, "medium");
    expect(harder(loadRecord("hearts"))).toBeNull();
    expect(harder(addGame("hearts", true, "medium"))).toBe("hard");
    expect(harder(addGame("hearts", true, "hard"))).toBeNull();
  });
  it("doesn't call a run mixed from different settings one skill's", () => {
    addGame("gin", true, "easy");
    addGame("gin", true, "hard");
    expect(harder(addGame("gin", true, "hard"))).toBeNull();
  });
});
