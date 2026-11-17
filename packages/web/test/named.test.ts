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
  it("leaves other people's sentences and other subjects alone", () => {
    expect(named("{1} sinks 15 and shoots again. {0} wins.", ["You", "Ann"])).toBe("Ann sinks 15 and shoots again. You win.");
    expect(named("{0}'s ball is knocked in, and goes back where it was", ["You"])).toBe("Your ball is knocked in, and goes back where it was");
  });
});
