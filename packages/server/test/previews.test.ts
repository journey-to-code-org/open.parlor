// A link to one game previews as that game.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPreviews, previewPage } from "../src/previews.js";

const PAGE = `<html><head>
<title>open.parlor: family card and board games</title>
<meta name="description" content="Family card and board games online." />
<meta property="og:url" content="https://p.test/" />
<meta property="og:title" content="open.parlor: family card and board games" />
<meta property="og:description" content="Family card and board games online." />
<meta property="og:image" content="https://p.test/og.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:alt" content="open.parlor" />
<meta name="twitter:title" content="open.parlor: family card and board games" />
<meta name="twitter:description" content="Family card and board games online." />
<meta name="twitter:image" content="https://p.test/og.jpg" />
</head></html>`;
const games = { chess: { name: "Chess", blurb: "Checkmate the king, against the clock if you like" }, odd: { name: `Tom & "Jerry" <b>`, blurb: "Cat & mouse" } };
const meta = (html: string, key: string) => new RegExp(`(?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];

describe("a game's link preview", () => {
  it("makes the page's title and preview tags the game's", () => {
    const page = previewPage(PAGE, { origin: "https://p.test", search: "?game=chess", games });
    expect(page).toContain("<title>Chess: play free on open.parlor</title>");
    expect(meta(page, "og:title")).toBe("Chess: play free on open.parlor");
    expect(meta(page, "og:description")).toBe("Checkmate the king, against the clock if you like. Play Chess free with family and friends, or against the computer. No sign-up, and it works offline.");
    expect(meta(page, "description")).toBe(meta(page, "og:description"));
    expect(meta(page, "og:url")).toBe("https://p.test/?game=chess");
    expect(meta(page, "og:image")).toBe("https://p.test/og/chess.jpg");
    expect(meta(page, "twitter:image")).toBe("https://p.test/og/chess.jpg");
    expect(meta(page, "og:image:width")).toBe("1200");
  });

  it("leaves the page as it was for the front page, an unknown game, or anything odd", () => {
    for (const search of ["", "?game=nope", "?game=constructor", "?game=../x", "?house=abc"]) expect(previewPage(PAGE, { origin: "https://p.test", search, games })).toBe(PAGE);
  });

  it("escapes what goes into the page", () => {
    const page = previewPage(PAGE, { origin: "https://p.test", search: "?game=odd", games });
    expect(page).toContain("<title>Tom &amp; &quot;Jerry&quot; &lt;b&gt;: play free on open.parlor</title>");
    expect(meta(page, "og:description")).toContain("Cat &amp; mouse");
  });

  it("reads the previews from the web build, only for games whose picture is there", () => {
    const web = mkdtempSync(join(tmpdir(), "parlor-og-"));
    expect(loadPreviews(web)).toEqual({});
    mkdirSync(join(web, "og"));
    writeFileSync(join(web, "og", "games.json"), JSON.stringify({ chess: games.chess, go: { name: "Go", blurb: "Stones" }, "../x": { name: "x", blurb: "x" } }));
    writeFileSync(join(web, "og", "chess.jpg"), "jpeg");
    expect(loadPreviews(web)).toEqual({ chess: games.chess });
  });
});
