import { describe, expect, it } from "vitest";
import { matchesSearch, searchWords } from "../src/home/search";

const chess = { name: "Chess", blurb: "The royal game: checkmate the king." };
const dropFour = { name: "Drop Four", blurb: "Line up four discs before your opponent." };
const ticTacToe = { name: "Tic-Tac-Toe", blurb: "Three in a row." };
const find = (game: { name: string; blurb: string }, category: string, query: string) => matchesSearch(game, category, searchWords(query));

describe("the front page's search", () => {
  it("shows every game when nothing is typed", () => {
    expect(find(chess, "Board games", "")).toBe(true);
    expect(find(chess, "Board games", "   ")).toBe(true);
  });

  it("finds a game by part of its name, whatever the case", () => {
    expect(find(chess, "Board games", "che")).toBe(true);
    expect(find(chess, "Board games", "CHESS")).toBe(true);
    expect(find(chess, "Board games", "spades")).toBe(false);
  });

  it("finds a game by its blurb or its category", () => {
    expect(find(chess, "Board games", "checkmate")).toBe(true);
    expect(find(chess, "Board games", "board")).toBe(true);
  });

  it("wants every word typed, in any order", () => {
    expect(find(dropFour, "Board games", "four drop")).toBe(true);
    expect(find(dropFour, "Board games", "drop five")).toBe(false);
  });

  it("doesn't mind punctuation, accents or a name run together", () => {
    expect(find(ticTacToe, "Board games", "tic tac")).toBe(true);
    expect(find(ticTacToe, "Board games", "tictactoe")).toBe(true);
    expect(find(dropFour, "Board games", "dropfour")).toBe(true);
    expect(find({ name: "Pokémon Café", blurb: "" }, "Arcade", "pokemon cafe")).toBe(true);
  });
});
