// The front page for a browser with JavaScript off. The web app's index.html carries the message
// itself, in a <noscript> block (packages/web/index.html): the games can't be played without a
// script. The one thing it can't know is whether this server has pages that work without one, so it
// leaves a marker and the server fills it in as it sends the page.
//
// A parlor published as plain files has no such pages, and the marker stays an unseen comment.

/** The comment in index.html's <noscript> block that stands for the server's own pages. */
export const SERVER_PAGES_MARKER = "<!--parlor:server-pages-->";

/**
 * The front page with the server's script-free pages linked from its no-JavaScript message, when
 * `on`: the games list and the daily sudoku, which are drawn on the server (pages.ts). Anything
 * else, or a page without the marker, comes back as it was.
 */
export function withServerPages(html: string, on: boolean): string {
  if (!on || !html.includes(SERVER_PAGES_MARKER)) return html;
  const links = `<p class="works">Two pages do work without it: <a href="/games">the list of games</a> and <a href="/daily">the daily sudoku</a>.</p>`;
  return html.replace(SERVER_PAGES_MARKER, links);
}
