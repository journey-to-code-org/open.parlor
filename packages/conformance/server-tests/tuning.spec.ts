// The admin app's Tuning page against a real server: a form built from a game's shape, a number the
// host changes and the game then reads, a mistake shown before anything is sent, and the way back to
// the game's own numbers. Every browser would change the same game at once on the one shared server,
// so this runs in one browser; what it checks is the form and the server, not the browser.
import { expect, request, test, type Page } from "@playwright/test";

test.skip(({ browserName }) => browserName !== "chromium", "One game's numbers, one server: run once");

const TOKEN = "let-the-host-in";
const BASE = "http://localhost:4180";

async function open(page: Page) {
  await page.goto("/admin/");
  await page.getByLabel("Admin token").fill(TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Playing now")).toBeVisible();
  await page.getByRole("tab", { name: "Tuning", exact: true }).click();
  await expect(page.getByTestId("saved")).toContainText(/Nothing changed|Version \d+/);
}
/** The Add button of one table (cards, foes): each table has its own. */
const adder = (page: Page, table: "cards" | "foes") => page.getByRole("group", { name: table }).getByRole("button", { name: "Add", exact: true });
/** A weekday's clues field (its label ends "(optional)", so it is matched by its start). */
const weekday = (page: Page, day: string) => page.getByLabel(new RegExp(`^${day}`));
const served = async () => {
  const api = await request.newContext({ baseURL: BASE });
  return (await api.get("/tunables/back-room")).json() as Promise<{ version: number; values: Record<string, unknown> }>;
};
async function back(page: Page) {
  const api = await request.newContext({ baseURL: BASE });
  await api.post("/moderation/tunables/back-room/reset", { data: {}, headers: { authorization: `Bearer ${TOKEN}` } });
  await page.close();
}

test("a number is changed, the game is given it, and it is put back", async ({ page }) => {
  await open(page);
  await expect(page.getByLabel("Game", { exact: true })).toBeVisible();
  const before = (await served()).version;

  // A card the game has: named from its own list, then its number.
  await page.getByLabel("Change another card").fill("wrench");
  await adder(page, "cards").click();
  await expect(page.getByText("Wrench (wrench)")).toBeVisible();
  await page.getByLabel("damage").fill("9");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/version \d+ is saved/i).first()).toBeVisible();
  const saved = await served();
  expect(saved.version).toBe(before + 1);
  expect(saved.values).toEqual({ cards: { wrench: { damage: 9 } } });
  // What was saved is what the form shows after.
  await expect(page.getByLabel("damage")).toHaveValue("9");

  // And the way back.
  await page.getByRole("button", { name: "Back to the game's own numbers" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Put them back" }).click();
  await expect(page.getByTestId("saved")).toContainText("Nothing changed");
  expect(await served()).toEqual({ version: before + 2, values: {} });
  await back(page);
});

test("a mistake is shown where it was made, and nothing can be saved with it", async ({ page }) => {
  await open(page);
  const version = (await served()).version;
  await page.getByLabel("Change another card").fill("wrench");
  await adder(page, "cards").click();
  const damage = page.getByLabel("damage");
  await damage.fill("100");
  await damage.blur();
  await expect(page.getByText("From 0 to 99.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await damage.fill("2.5");
  await damage.blur();
  await expect(page.getByText("Use a whole number.").first()).toBeVisible();
  await damage.fill("12");
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  // Nothing was sent along the way.
  expect((await served()).version).toBe(version);
  // A name the game doesn't allow can't be added, nor one that is already there.
  await page.getByLabel("Change another card").fill("Bad Name");
  await expect(page.getByText("Lowercase letters, digits and dashes, starting with a letter.")).toBeVisible();
  await expect(adder(page, "cards")).toBeDisabled();
  await page.getByLabel("Change another card").fill("wrench");
  await expect(page.getByText("Already there.")).toBeVisible();
  // Undo goes back to what is saved.
  await page.getByRole("button", { name: "Undo my changes" }).click();
  await expect(page.getByText("Wrench (wrench)")).toHaveCount(0);
  await back(page);
});

test("a foe's attacks are a list, and a step needs its number", async ({ page }) => {
  await open(page);
  await page.getByLabel("Change another foe").fill("rat");
  await adder(page, "foes").click();
  await page.getByRole("button", { name: "Add a step" }).click();
  await expect(page.getByText("amount is needed.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await page.getByLabel("amount").fill("4");
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/version \d+ is saved/i).first()).toBeVisible();
  expect((await served()).values).toEqual({ foes: { rat: { pattern: [{ kind: "attack", amount: 4 }] } } });
  await back(page);
});

test("the sudoku's clues are a number for each weekday, all of them or none", async ({ page }) => {
  await open(page);
  await page.getByLabel("Game", { exact: true }).selectOption({ label: "The daily sudoku" });
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  // A row for each day, and no way to add or take one away.
  for (const day of days) await expect(weekday(page, day)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a step" })).toHaveCount(0);
  // Some, and the rest empty: not enough to save.
  await weekday(page, "Sunday").fill("45");
  await expect(page.getByText("Fill in all 7, or leave them all empty.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await weekday(page, "Monday").fill("5");
  await expect(page.getByText("From 22 to 60.").first()).toBeVisible();
  for (const [i, day] of days.entries()) await weekday(page, day).fill(String(40 - i * 2));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/version \d+ is saved/i).first()).toBeVisible();
  const api = await request.newContext({ baseURL: BASE });
  const saved = (await (await api.get("/tunables/sudoku")).json()) as { values: { clues: number[] } };
  expect(saved.values.clues).toEqual([40, 38, 36, 34, 32, 30, 28]);
  await api.post("/moderation/tunables/sudoku/reset", { data: {}, headers: { authorization: `Bearer ${TOKEN}` } });
  await page.close();
});
