// The notes say the suite is clean on the Zubra this package declares. This fails the run if the
// installed packages are not in that range, so a pass cannot be of an older Zubra. The range is
// read from package.json, so a bump there is all it takes to move the line.
import { expect, test } from "@playwright/test";
import { ZUBRA_PACKAGES, declaredRange, satisfiesCaret, zubraVersion } from "./zubra-line.ts";

test("the checks run on the Zubra line this package declares", () => {
  for (const name of ZUBRA_PACKAGES) {
    const version = zubraVersion(name);
    const range = declaredRange(name);
    expect(satisfiesCaret(version, range), `${name}@${version} is outside ${range}`).toBe(true);
  }
});
