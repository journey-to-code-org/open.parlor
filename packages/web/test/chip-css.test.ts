import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The poker chip is an <i class="chip"> in a .chip-col. Pages elsewhere use `.chip`
// for small pills (the "New" badge), so a bare `.chip` rule in the shared stylesheet
// once stretched that badge across the whole screen.
describe("chip styles", () => {
  it("never style a bare .chip, only one inside a chip pile", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const bare = [...css.matchAll(/([^{}]+)\{/g)]
      .flatMap((m) => (m[1] ?? "").split(/,(?![^(]*\))/))
      .map((s) => s.trim())
      .filter((s) => /(^|[\s>+~])\.chip(?![\w-])/.test(s))
      .filter((s) => !/\.chip-(pile|col)|palace-seat/.test(s));
    expect(bare).toEqual([]);
  });
});
