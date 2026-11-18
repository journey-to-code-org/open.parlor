// Read the Room in the parlor: the names in what the room said, and that every kind of question
// the game can ask is one the form knows how to draw.
import { formAllows, readTheRoom, type WordForm } from "@journey-to-code/games";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { roomNamed } from "../src/room/names";

describe("Read the Room", () => {
  it("writes seats as names", () => {
    expect(roomNamed("The room said {1}.", ["Ann", "Bo"])).toBe("The room said Bo.");
    expect(roomNamed("{0} and {3}", ["Ann"])).toBe("Ann and Player 4");
    expect(roomNamed("No seats here", [])).toBe("No seats here");
  });

  it("has a control in the form for every kind of question the game asks", () => {
    const form = readFileSync(new URL("../src/room/RoomForm.vue", import.meta.url), "utf8");
    const kinds = new Set<string>();
    let s = readTheRoom.newGame(readTheRoom.normalize(null), 4, 2);
    for (let guard = 0; guard < 400 && !readTheRoom.summary(s).over; guard++) {
      for (let seat = 0; seat < 4; seat++) {
        const asked: WordForm | null | undefined = readTheRoom.view(s, seat).form;
        if (asked) kinds.add(asked.kind);
        const move = readTheRoom.bot(s, seat, {}, () => 0.4);
        if (move) {
          if (asked) expect(formAllows({ form: asked }, move)).toBe(true);
          s = readTheRoom.apply(s, seat, move);
        }
      }
    }
    expect([...kinds].sort()).toEqual(["caption", "either", "rate", "scale", "three", "vote"]);
    // "rate" is the form's last branch, the one with no kind named.
    for (const kind of kinds) if (kind !== "rate") expect(form, kind).toContain(`form.kind === '${kind}'`);
  });
});
