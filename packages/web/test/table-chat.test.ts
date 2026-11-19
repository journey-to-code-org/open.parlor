// A table's chat on the page: open.chat's, with a table as its room. The chat itself is tested in
// open.chat and the server's side in packages/server; this is how the table reads what arrives.
import { describe, expect, it } from "vitest";
import { asTableMessages, tableRoomOf } from "../src/tableChat";

describe("a table's chat", () => {
  it("is the room table:<id>", () => {
    expect(tableRoomOf("ab12cd")).toBe("table:ab12cd");
  });

  it("reads each message as its seat's, the host's notices as nobody's, and leaves out anything the table can't show", () => {
    const at = 1_700_000_000_000;
    expect(
      asTableMessages([
        { id: 1, by: "seat:0", name: "Grammi", text: "Good luck", at },
        { id: 2, by: "seat:12", name: "Dot", text: "You too, sugar", at, bot: true },
        { id: 3, by: "", name: "", text: "The host paused the game.", at, notice: true },
        { id: 4, by: "seat:1", name: "Rowdy", text: "Spades?", at, poll: { options: ["Yes", "No"], votes: {} } },
        { id: 5, by: "watching", name: "Someone", text: "Hi", at },
      ]),
    ).toEqual([
      { seat: 0, name: "Grammi", text: "Good luck", at, bot: false },
      { seat: 12, name: "Dot", text: "You too, sugar", at, bot: true },
      { seat: -1, name: "", text: "The host paused the game.", at, bot: false, notice: true },
      { seat: -1, name: "Someone", text: "Hi", at, bot: false },
    ]);
  });
});
