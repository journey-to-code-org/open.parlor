// The front page's search box: what a player types, matched against a game's name, its blurb and
// the shelf it sits on. Case, accents and punctuation don't count, so "tic tac" finds Tic-Tac-Toe
// and "dropfour" finds Drop Four.

/** Lower case, no accents, and anything that isn't a letter or a number turned into a space. */
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The words a player typed. An empty search has none, and matches every game. */
export const searchWords = (query: string): string[] => plain(query).split(" ").filter(Boolean);

/**
 * Whether a game answers a search: every word typed is somewhere in its name, its blurb or its
 * category. A word also matches the name run together, so "dropfour" and "tictactoe" work.
 */
export function matchesSearch(game: { name: string; blurb: string }, category: string, words: string[]): boolean {
  if (!words.length) return true;
  const name = plain(game.name);
  const text = `${name} ${plain(game.blurb)} ${plain(category)}`;
  const joined = name.replace(/ /g, "");
  return words.every((word) => text.includes(word)) || joined.includes(words.join(""));
}
