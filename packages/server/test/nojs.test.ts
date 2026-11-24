// The front page's message for a browser with JavaScript off (the <noscript> block in the web app's
// index.html): the server links its own script-free pages from it, and only where they are on.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SERVER_PAGES_MARKER, withServerPages } from "../src/nojs.js";

const PAGE = `<body><div id="root"></div><noscript><main class="nojs"><h1>The games need JavaScript</h1>${SERVER_PAGES_MARKER}</main></noscript></body>`;

describe("the no-JavaScript front page", () => {
  it("links the games list and the daily sudoku when the server's pages are on", () => {
    const page = withServerPages(PAGE, true);
    expect(page).not.toContain(SERVER_PAGES_MARKER);
    expect(page).toContain('<a href="/games">');
    expect(page).toContain('<a href="/daily">');
  });

  it("leaves the marker alone, and links nothing, when they are off", () => {
    const page = withServerPages(PAGE, false);
    expect(page).toBe(PAGE);
    expect(page).not.toContain("/games");
  });

  it("returns a page without the marker as it was", () => {
    expect(withServerPages("<body>hi</body>", true)).toBe("<body>hi</body>");
  });

  it("finds the marker in the web app's real index.html, inside <noscript>, once", () => {
    const html = readFileSync(new URL("../../web/index.html", import.meta.url), "utf8");
    expect(html.split(SERVER_PAGES_MARKER)).toHaveLength(2);
    const noscript = /<noscript>\s*<main class="nojs">[\s\S]*?<\/noscript>/.exec(html)?.[0] ?? "";
    expect(noscript).toContain(SERVER_PAGES_MARKER);
    expect(noscript).toContain("The games need JavaScript");
    // The app's own mount point stays in the page before it, empty, for the script to fill.
    expect(html).toMatch(/<div id="root"><\/div>/);
  });
});
