// The admin app's Inspector against a real server: a Back Room run code pasted in, played back by the
// game's own rules, stepped through, and a changed or foreign one shown for what it is. The run codes are
// made here by the same engine the page uses, so what the inspector shows can be checked against it.
import { expect, test, type Page } from "@playwright/test";
import { encode, inspect, type RunRecord } from "../../wasm/src/battler/record.ts";
import { playRun } from "../../wasm/test/battler-bots.ts";

const TOKEN = "let-the-host-in";
const hex = (n: number) => n.toString(16).padStart(8, "0");

function run(seed = 7, numbers = 0): RunRecord {
  return { seed, numbers, commands: [...playRun(seed, { deckBuild: true }).given] };
}

async function open(page: Page) {
  await page.goto("/admin/");
  await page.getByLabel("Admin token").fill(TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Playing now")).toBeVisible();
  await page.getByRole("tab", { name: "Inspector", exact: true }).click();
  await expect(page.getByLabel("Run code")).toBeVisible();
}
const stepper = (page: Page) => page.getByRole("group", { name: "Step through the run" });
const play = (page: Page) => page.getByRole("button", { name: "Play it back" });

test("nothing to play until there is a run, and what isn't one is said so", async ({ page }) => {
  await open(page);
  await expect(play(page)).toBeDisabled();
  await page.getByLabel("Run code").fill("hello");
  await page.getByLabel("Run code").blur();
  await expect(page.getByText(/isn't a Back Room run/)).toBeVisible();
  await expect(play(page)).toBeDisabled();
  await page.getByLabel("Run code").fill(`bkr1.${Buffer.from("not json").toString("base64url")}`);
  await expect(page.getByText(/damaged/)).toBeVisible();
  await expect(play(page)).toBeDisabled();
  await page.getByLabel("Run code").fill(encode({ seed: 1, numbers: 0, commands: [{ t: "fly" } as never] }));
  await expect(page.getByText(/Command 1 of that run/)).toBeVisible();
  await expect(play(page)).toBeDisabled();
  await expect(page.getByTestId("seed")).toHaveCount(0);
});

test("a run is played back, and stepped through from the start to the end", async ({ page }) => {
  const record = run(7);
  const seen = inspect(record);
  await open(page);
  await page.getByLabel("Run code").fill(encode(record));
  await expect(play(page)).toBeEnabled();
  await play(page).click();

  await expect(page.getByTestId("seed")).toContainText("7");
  await expect(page.getByTestId("numbers")).toContainText("0");
  await expect(page.getByTestId("phase")).toContainText(seen.phase);
  await expect(page.getByTestId("hash")).toContainText(hex(seen.hash));
  await expect(page.getByTestId("refused")).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Not the numbers" })).toHaveCount(0);

  const last = seen.steps.length - 1;
  await expect(page.getByTestId("where")).toHaveText(`Move 0 of ${last}`);
  await expect(page.getByTestId("step")).toContainText("Start");
  await expect(stepper(page).getByRole("button", { name: "Back", exact: true })).toBeDisabled();
  await expect(stepper(page).getByRole("button", { name: "Start", exact: true })).toBeDisabled();

  await stepper(page).getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByTestId("where")).toHaveText(`Move 1 of ${last}`);
  await expect(page.getByTestId("step")).toContainText(seen.steps[1]!.says);
  await expect(page.getByTestId("step")).toContainText(hex(seen.steps[1]!.hash));
  await stepper(page).getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByTestId("where")).toHaveText(`Move 0 of ${last}`);

  await stepper(page).getByRole("button", { name: "End", exact: true }).click();
  await expect(page.getByTestId("where")).toHaveText(`Move ${last} of ${last}`);
  await expect(page.getByTestId("step")).toContainText(hex(seen.hash));
  await expect(stepper(page).getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await expect(stepper(page).getByRole("button", { name: "End", exact: true })).toBeDisabled();

  // Cleared: back to nothing.
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("seed")).toHaveCount(0);
  await expect(page.getByLabel("Run code")).toHaveValue("");
});

test("a run with a move the game wouldn't take stops there and says which", async ({ page }) => {
  const record = run(7);
  const bad: RunRecord = { ...record, commands: [...record.commands.slice(0, 3), { t: "take", index: 0 }, ...record.commands.slice(3)] };
  await open(page);
  await page.getByLabel("Run code").fill(encode(bad));
  await play(page).click();
  const banner = page.getByTestId("refused");
  await expect(banner).toContainText("wouldn't take move 4");
  await expect(banner).toContainText("not now");
  // Opened at the move before the one that was refused.
  await expect(page.getByTestId("where")).toHaveText("Move 3 of 4");
});

test("a run from other numbers is played on the parlor's, and says so", async ({ page }) => {
  await open(page);
  await page.getByLabel("Run code").fill(encode(run(9, 4)));
  await play(page).click();
  await expect(page.getByTestId("numbers")).toContainText("4");
  await expect(page.getByText(/played on version 4 of the host's numbers/)).toBeVisible();
  await expect(page.getByTestId("hash")).toBeVisible();
});

test("a tab of its own, with an address", async ({ page }) => {
  await open(page);
  expect(page.url()).toMatch(/\/admin\/inspector$/);
  await page.goto("/admin/inspector");
  await expect(page.getByLabel("Run code")).toBeVisible();
});

test("a run copied from the Back Room page plays back in the Inspector, move for move", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "reads the clipboard, which only Chromium lets a test grant");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/wasm/battler/?seed=7");
  await expect(page.getByRole("group", { name: "Foes" })).toBeVisible();
  // Two turns ended by hand: two commands the page recorded.
  await page.getByRole("button", { name: "End turn" }).click();
  await page.getByRole("button", { name: "End turn" }).click();
  await page.getByRole("button", { name: "Copy run code" }).click();
  await expect(page.getByText(/Run code copied \(2 moves\)/)).toBeVisible();
  const code = await page.evaluate(() => navigator.clipboard.readText());
  expect(code).toMatch(/^bkr1\./);

  await open(page);
  await page.getByLabel("Run code").fill(code);
  await play(page).click();
  await expect(page.getByTestId("seed")).toContainText("7");
  await expect(page.getByTestId("where")).toHaveText("Move 0 of 2");
  await stepper(page).getByRole("button", { name: "End", exact: true }).click();
  await expect(page.getByTestId("step")).toContainText("End the turn");
  await expect(page.getByTestId("refused")).toHaveCount(0);
  // The same hash the engine gives for those two commands.
  const seen = inspect({ seed: 7, numbers: 0, commands: [{ t: "end" }, { t: "end" }] });
  await expect(page.getByTestId("hash")).toContainText(hex(seen.hash));
});
