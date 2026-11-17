import { describe, expect, it } from "vitest";
import { named } from "../src/kit/named";

describe("narration with you in it", () => {
  it("conjugates the verb after your name", () => {
    expect(named("{0} sinks the 3.", ["You", "Ann"])).toBe("You sink the 3.");
    expect(named("{1} sinks the 3.", ["You", "Ann"])).toBe("Ann sinks the 3.");
  });
  it("conjugates a second verb in the same sentence", () => {
    expect(named("{0} sinks 15 on the break and shoots again.", ["You", "Ann"])).toBe("You sink 15 on the break and shoot again.");
    expect(named("{0} sinks the 2 and takes the solids and shoots again.", ["You"])).toBe("You sink the 2 and take the solids and shoot again.");
  });
  it("knows the dice games' verbs", () => {
    expect(named("{0} banks 600 and reaches 10000: everyone else has one more turn", ["You", "Ann"])).toBe("You bank 600 and reach 10000: everyone else has one more turn");
    expect(named("{0} busts and loses 450", ["You"])).toBe("You bust and lose 450");
    expect(named("{0} shuts 2, 3 and 4", ["You"])).toBe("You shut 2, 3 and 4");
    expect(named("{0} stays in port. {1} takes round 1 with a cargo of 9", ["You", "Ann"])).toBe("You stay in port. Ann takes round 1 with a cargo of 9");
    expect(named("{1} sails with a cargo of 6. {0} takes round 1 with a cargo of 9", ["You", "Ann"])).toBe("Ann sails with a cargo of 6. You take round 1 with a cargo of 9");
    expect(named("{1} calls {0} a liar on 6 fives: there are 5 fives, so {0} loses a die", ["You", "Ann"])).toBe("Ann calls you a liar on 6 fives: there are 5 fives, so you lose a die");
  });
  it("leaves other people's sentences and other subjects alone", () => {
    expect(named("{1} sinks 15 and shoots again. {0} wins.", ["You", "Ann"])).toBe("Ann sinks 15 and shoots again. You win.");
    expect(named("{0}'s ball is knocked in, and goes back where it was", ["You"])).toBe("Your ball is knocked in, and goes back where it was");
  });
});
