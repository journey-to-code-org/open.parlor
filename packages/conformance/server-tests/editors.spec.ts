// The Mini Golf course editor and the bowling lane editor, as a maker uses them: paint, undo, see
// the computer's verdict, name it, save it, find it again on the server. They are Svelte inside the
// React app, on the parlor's Zubra components; these tests don't care which framework draws them,
// so they held for the React editors before the move and hold for the Svelte ones after.
import { expect, test, type Page } from "@playwright/test";

/** A confirm() asked in the editor ("Remove Hole 2?"): yes. */
const agree = (page: Page) => page.on("dialog", (dialog) => void dialog.accept());
const squares = (page: Page) => page.locator(".golf-grid .golf-square");
/** Click the middle of one square of the grid (col and row from the top left). */
async function tap(page: Page, col: number, row: number, cols: number, rows: number) {
  const box = (await page.locator(".golf-grid").boundingBox())!;
  await page.mouse.click(box.x + ((col + 0.5) * box.width) / cols, box.y + ((row + 0.5) * box.height) / rows);
}
const verdict = (page: Page) => page.locator(".golf-verdict");

// Tall enough for the whole grid on the screen: a tap or a drag is a real pointer at a point.
test.use({ viewport: { width: 1280, height: 1300 } });

test.describe("the course editor", () => {
  test("paint, undo, holes and size", async ({ page }) => {
    agree(page);
    await page.goto("/?golf=new");
    await expect(page.getByRole("heading", { name: "Make a Mini Golf course" })).toBeVisible();
    // The starter hole: 7 by 13, the computer plays it.
    await expect(squares(page)).toHaveCount(7 * 13);
    await expect(verdict(page)).toContainText("Putting like a decent player", { timeout: 20_000 });
    await expect(page.locator("canvas.hole-preview")).toBeVisible();

    await page.getByRole("radio", { name: "Wall" }).click();
    await expect(page.getByRole("radio", { name: "Wall" })).toHaveAttribute("aria-checked", "true");
    await tap(page, 3, 6, 7, 13);
    await expect(squares(page).nth(6 * 7 + 3)).toHaveClass(/\bwall\b/);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(squares(page).nth(6 * 7 + 3)).toHaveClass(/\bgreen\b/);
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

    // A drag paints every square between.
    const box = (await page.locator(".golf-grid").boundingBox())!;
    const at = (col: number, row: number) => [box.x + ((col + 0.5) * box.width) / 7, box.y + ((row + 0.5) * box.height) / 13] as const;
    await page.mouse.move(...at(2, 4));
    await page.mouse.down();
    await page.mouse.move(...at(4, 4), { steps: 1 });
    await page.mouse.up();
    for (const col of [2, 3, 4]) await expect(squares(page).nth(4 * 7 + col)).toHaveClass(/\bwall\b/);
    // A wall straight across the green: no way from the tee to the cup, so no preview and no save.
    await expect(page.locator(".golf-unplayable")).toBeVisible();
    await expect(page.locator(".golf-holes .golf-flag")).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();

    // The tee is one of a kind: painting it again moves it.
    await page.getByRole("radio", { name: "Tee" }).click();
    await tap(page, 2, 11, 7, 13);
    await expect(page.locator(".golf-grid .golf-square.tee")).toHaveCount(1);
    await expect(squares(page).nth(11 * 7 + 2)).toHaveClass(/\btee\b/);

    // Size.
    await page.getByLabel("Squares across").selectOption("9");
    await expect(squares(page)).toHaveCount(9 * 13);

    // Holes: add, move, remove.
    await page.getByRole("button", { name: "+ Add a hole" }).click();
    const holes = page.locator(".golf-holes button:not(.add)");
    await expect(holes).toHaveCount(2);
    await expect(holes.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Hole name")).toHaveValue("Hole 2");
    await expect(squares(page)).toHaveCount(7 * 13);
    await page.getByRole("button", { name: "Move earlier" }).click();
    await expect(holes.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Hole name")).toHaveValue("Hole 2");
    await page.getByRole("button", { name: "Remove this hole" }).click();
    await expect(holes).toHaveCount(1);
    await expect(page.getByLabel("Hole name")).toHaveValue("Hole 1");
    await expect(squares(page)).toHaveCount(9 * 13);
  });

  test("save it, find it on the server, and play it", async ({ page }) => {
    await page.goto("/?golf=new");
    const name = `Course ${Date.now()}`;
    await page.getByLabel("Course name").fill(name);
    await page.getByLabel("Hole name").fill("The long one");
    await page.getByLabel("A tip at the tee").fill("Aim left");
    const save = page.getByRole("button", { name: "Save the course" });
    await expect(save).toBeEnabled({ timeout: 20_000 });
    await save.click();
    await expect(page.getByText("Saved. Only you see it in Mini Golf")).toBeVisible();
    // The server takes a maker's saves a second and a half apart.
    const firstSave = Date.now();
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeDisabled();
    await expect(page).toHaveURL(/[?&]golf=(?!new)[^&]+/);

    // From the server, not from this tab's draft.
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByLabel("Course name")).toHaveValue(name);
    await expect(page.getByLabel("Hole name")).toHaveValue("The long one");
    await expect(page.getByLabel("A tip at the tee")).toHaveValue("Aim left");
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();

    // A change is unsaved until it's saved; sharing is a change.
    await page.getByLabel("Share it: everyone can pick it in Mini Golf").check();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled({ timeout: 20_000 });
    await page.waitForTimeout(Math.max(0, firstSave + 1600 - Date.now()));
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved, and shared")).toBeVisible();

    await page.getByRole("button", { name: "Play it against the computer" }).click();
    await expect(page.getByRole("heading", { name: "Make a Mini Golf course" })).toHaveCount(0);
    await expect(page.locator("canvas").filter({ visible: true }).first()).toBeVisible();
  });

  test("watch the computer, play a practice round, and come back to the draft", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    agree(page);
    await page.goto("/?golf=new");
    await page.getByLabel("Course name").fill("Not saved yet");
    const watch = page.locator(".golf-verdict button");
    await expect(watch).toHaveText("Watch the computer play it", { timeout: 20_000 });
    await watch.click();
    await expect(watch).toHaveText("Watching…");
    await expect(watch).toHaveText("Watch the computer play it", { timeout: 30_000 });

    await page.getByRole("button", { name: "Play it against the computer" }).click();
    await page.getByRole("button", { name: "Got it" }).click();
    await page.getByRole("button", { name: "Leave game" }).click();
    await expect(page.getByRole("heading", { name: "Make a Mini Golf course" })).toBeVisible();
    await expect(page.getByLabel("Course name")).toHaveValue("Not saved yet");
    await expect(page.getByRole("button", { name: "Save the course" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("the lane editor", () => {
  test("paint, undo, verdict, save and find it", async ({ page }) => {
    agree(page);
    await page.goto("/?lane=new");
    await expect(page.getByRole("heading", { name: "Make a bowling lane" })).toBeVisible();
    const count = await squares(page).count();
    expect(count).toBeGreaterThan(20);
    const cols = await page.locator(".golf-grid").evaluate((el) => Number(getComputedStyle(el).getPropertyValue("--cols")));
    const rows = count / cols;
    await expect(verdict(page)).toContainText("Bowling like a decent player", { timeout: 20_000 });

    await page.getByRole("radio", { name: "Crate" }).click();
    await tap(page, 1, 2, cols, rows);
    await expect(squares(page).nth(2 * cols + 1)).toHaveClass(/\bcrate\b/);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(squares(page).nth(2 * cols + 1)).toHaveClass(/\blane-open\b/);
    await tap(page, 1, 2, cols, rows);
    await expect(page.getByRole("button", { name: "Clear the lane" })).toBeEnabled();
    await page.getByRole("button", { name: "Clear the lane" }).click();
    await expect(page.locator(".golf-grid .golf-square.crate")).toHaveCount(0);
    await tap(page, 0, 2, cols, rows);

    const name = `Lane ${Date.now()}`;
    await page.getByLabel("Lane name").fill(name);
    await page.getByLabel("Share it: everyone can pick it in Bowling").check();
    const save = page.getByRole("button", { name: "Save the lane" });
    await expect(save).toBeEnabled({ timeout: 20_000 });
    await save.click();
    await expect(page.getByText("Saved, and shared")).toBeVisible();
    await expect(page).toHaveURL(/[?&]lane=(?!new)[^&]+/);

    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByLabel("Lane name")).toHaveValue(name);
    await expect(squares(page).nth(2 * cols)).toHaveClass(/\bcrate\b/);
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Bowl on it against the computer" }).click();
    await expect(page.getByRole("heading", { name: "Make a bowling lane" })).toHaveCount(0);
  });

  test("a lane with no way through can't be bowled", async ({ page }) => {
    await page.goto("/?lane=new");
    // The editor is fetched when it is opened: it is there once its heading is. Count once the grid
    // is drawn: before, it has no squares and the sums below divide by nothing.
    await expect(page.getByRole("heading", { name: "Make a bowling lane" })).toBeVisible();
    await expect(squares(page).first()).toBeVisible();
    const count = await squares(page).count();
    const cols = await page.locator(".golf-grid").evaluate((el) => Number(getComputedStyle(el).getPropertyValue("--cols")));
    const rows = count / cols;
    await page.getByRole("radio", { name: "Crate" }).click();
    // A row of crates across the lane.
    const box = (await page.locator(".golf-grid").boundingBox())!;
    const y = box.y + (2.5 * box.height) / rows;
    await page.mouse.move(box.x + (0.5 * box.width) / cols, y);
    await page.mouse.down();
    await page.mouse.move(box.x + ((cols - 0.5) * box.width) / cols, y, { steps: 1 });
    await page.mouse.up();
    await expect(page.locator(".golf-grid .golf-square.crate")).toHaveCount(cols);
    await expect(verdict(page)).toContainText("Can't be bowled", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Save the lane" })).toBeDisabled();
    await expect(page.getByText("Before it can be bowled")).toBeVisible();
  });
});
