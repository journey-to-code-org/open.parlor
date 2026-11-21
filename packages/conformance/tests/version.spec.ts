// The notes say the suite is clean on Zubra 6.0.2. This fails the run if the installed packages
// are not that line, so a pass cannot be of an older Zubra.
import { expect, test } from "@playwright/test";
import { ZUBRA_PACKAGES, onZubra6, zubraVersion } from "./zubra-line.ts";

test("the checks run on Zubra 6.0.2 or a later 6.x", () => {
  for (const name of ZUBRA_PACKAGES) {
    const version = zubraVersion(name);
    expect(onZubra6(version), `${name}@${version} is outside ^6.0.2`).toBe(true);
  }
});
