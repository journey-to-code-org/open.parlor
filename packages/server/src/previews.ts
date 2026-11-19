// A link to a game (/?game=chess) previews as that game: its name, its line and its picture, not the
// parlor's front page. Link previews are read by robots that don't run the page's script, so the
// server writes them into the page it sends.
//
// The names, lines and pictures come from the web app's build: public/og/<id>.jpg and
// public/og/games.json, drawn by web/scripts/og-games.mjs from the front page's own tiles. A game
// with neither keeps the parlor's own preview.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface GamePreview {
  name: string;
  blurb: string;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Read the games' previews from a web build (dist/og/games.json); none when the build has none. */
export function loadPreviews(web: string): Record<string, GamePreview> {
  const file = join(web, "og", "games.json");
  if (!existsSync(file)) return {};
  try {
    const all = JSON.parse(readFileSync(file, "utf8")) as Record<string, Partial<GamePreview>>;
    // Only games whose picture is there too.
    return Object.fromEntries(Object.entries(all).filter(([id, g]) => /^[a-z0-9-]+$/.test(id) && typeof g.name === "string" && typeof g.blurb === "string" && existsSync(join(web, "og", `${id}.jpg`)))) as Record<string, GamePreview>;
  } catch {
    return {};
  }
}

/** Set one tag's content: a <meta property|name="key" content="…">. */
function setMeta(html: string, key: string, value: string) {
  const tag = new RegExp(`(<meta\\s+(?:property|name)="${key.replace(/[.:]/g, "\\$&")}"\\s+content=")[^"]*(")`);
  return html.replace(tag, `$1${escape(value)}$2`);
}

/**
 * The page for a link to a game: the parlor's page with its title and preview tags made the game's.
 * `origin` is this server's address, as the preview's picture needs it whole; anything but a known
 * game returns the page as it was.
 */
export function previewPage(html: string, { origin, search, games }: { origin: string; search: string; games: Record<string, GamePreview> }): string {
  const id = new URLSearchParams(search).get("game") ?? "";
  const game = Object.hasOwn(games, id) ? games[id]! : null;
  if (!game) return html;
  const title = `${game.name}: play free on open.parlor`;
  const about = `${game.blurb}. Play ${game.name} free with family and friends, or against the computer. No sign-up, and it works offline.`;
  const url = `${origin}/?game=${encodeURIComponent(id)}`;
  const image = `${origin}/og/${id}.jpg`;
  let page = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`);
  for (const [key, value] of [
    ["description", about],
    ["og:title", title],
    ["og:description", about],
    ["og:url", url],
    ["og:image", image],
    ["og:image:alt", `${game.name} on open.parlor: ${game.blurb}`],
    ["twitter:title", title],
    ["twitter:description", about],
    ["twitter:image", image],
  ] as const)
    page = setMeta(page, key, value);
  return page;
}
