import { beforeEach, describe, expect, it } from "vitest";
import { lookForFixes, REPORT_KEPT_MS, rememberReport, told, waiting } from "../src/fixedNotice";

// The tests run in Node: a localStorage of their own.
const store = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } });
beforeEach(() => store.clear());

describe("hearing that a report was fixed", () => {
  it("remembers each report sent, newest first, once each", () => {
    rememberReport(12, 1_000);
    rememberReport(30, 2_000);
    rememberReport(12, 3_000);
    expect(waiting(4_000)).toEqual([12, 30]);
  });

  it("lets a report go once told, and after half a year", () => {
    rememberReport(12, 1_000);
    rememberReport(30, 2_000);
    told([12], 3_000);
    expect(waiting(3_000)).toEqual([30]);
    expect(waiting(2_000 + REPORT_KEPT_MS)).toEqual([]);
  });

  it("asks the server about the ones waiting, and believes it only about those", async () => {
    rememberReport(12, Date.now() - 2_000);
    rememberReport(30, Date.now() - 1_000);
    let asked = "";
    const get = (async (url: string) => {
      asked = url;
      return Response.json({ fixed: [{ number: 30, title: "Golf editor" }, { number: 99, title: "Someone else's" }] });
    }) as unknown as typeof fetch;
    expect(await lookForFixes(get)).toEqual([{ number: 30, title: "Golf editor" }]);
    expect(asked).toBe("/bugs/fixed?n=30,12");
  });

  it("asks nothing when nothing is waiting, and hears nothing when there's no server", async () => {
    let calls = 0;
    const get = (async () => {
      calls++;
      throw new TypeError("no server");
    }) as unknown as typeof fetch;
    expect(await lookForFixes(get)).toEqual([]);
    expect(calls).toBe(0);
    rememberReport(12);
    expect(await lookForFixes(get)).toEqual([]);
    expect(calls).toBe(1);
  });
});
