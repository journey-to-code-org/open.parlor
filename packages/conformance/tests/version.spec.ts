// The notes say the suite is clean on the Zubra this package declares. A run on something outside
// that range is still a run: it warns here (and in the run's annotations) instead of failing, so a
// newer Zubra can be tried before the range is moved. The range is read from package.json, so a
// bump there is all it takes to move the line.
import { test } from "@playwright/test";
import { ZUBRA_PACKAGES, declaredRange, satisfiesCaret, zubraVersion } from "./zubra-line.ts";

test("the checks run on the Zubra line this package declares", () => {
  for (const name of ZUBRA_PACKAGES) {
    const version = zubraVersion(name);
    const range = declaredRange(name);
    if (satisfiesCaret(version, range)) continue;
    const description = `${name}@${version} is outside ${range}: this run is not of the line the notes describe.`;
    console.warn(`warning: ${description}`);
    test.info().annotations.push({ type: "warning", description });
  }
});
