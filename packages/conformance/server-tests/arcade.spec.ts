// What the arcade table puts over a game: the pause sheet (its controls, carry on, leave) and the
// game-over sheet (the score, the best on this device, the run's numbers, play again). The game is
// left to play itself with the clock run forward until it ends.
import { expect, test } from "@playwright/test";

test("pause, carry on, then a game left alone ends with its sheet, and plays again", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.clock.install();
  await page.goto("/?game=skyfire");
  // One ship: left alone, it's over soon.
  await page.getByRole("combobox", { name: "Rules" }).selectOption({ label: "One ship" });
  await page.locator("button.primary.deal").click();
  const howto = page.getByRole("button", { name: "Got it" });
  await page.clock.runFor(500);
  if (await howto.isVisible()) await howto.click();
  const field = page.getByRole("img", { name: /the field/ }).or(page.locator("canvas[aria-label$='the field']"));
  await expect(field.first()).toBeVisible();

  // Paused: by its key, with the game's controls listed; carried on by its button.
  await page.locator("canvas[aria-label$='the field']").focus();
  await page.keyboard.press("p");
  const paused = page.getByRole("region", { name: "Paused" });
  await expect(paused).toBeVisible();
  await expect(paused.getByRole("heading", { name: "Paused" })).toBeVisible();
  await expect(paused.locator(".arcade-controls li").first()).toBeVisible();
  await expect(paused.getByRole("button", { name: "Carry on" })).toBeFocused();
  await paused.getByRole("button", { name: "Carry on" }).click();
  await expect(paused).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(paused).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(paused).toHaveCount(0);

  // Left alone, the game ends.
  const over = page.getByRole("region", { name: "Game over" });
  for (let i = 0; i < 60 && !(await over.isVisible()); i++) await page.clock.runFor(2_000);
  await expect(over).toBeVisible();
  await expect(over.getByRole("heading", { name: "Game over" })).toBeVisible();
  await expect(over.locator(".arcade-final")).toHaveText(/\d/);
  await expect(over.getByText(/A new best on this device|Your best:/)).toBeVisible();
  await expect(over.locator(".arcade-stats dt", { hasText: "Time" })).toBeVisible();
  await expect(over.getByRole("button", { name: "Play again" })).toBeFocused();
  await over.getByRole("button", { name: "Play again" }).click();
  await expect(over).toHaveCount(0);
  await expect(page.locator("canvas[aria-label$='the field']")).toBeVisible();
  // Paused again, and left from the sheet.
  await page.locator("canvas[aria-label$='the field']").focus();
  await page.keyboard.press("p");
  await page.getByRole("region", { name: "Paused" }).getByRole("button", { name: "Leave the game" }).click();
  await expect(page.locator("canvas[aria-label$='the field']")).toHaveCount(0);
  expect(errors).toEqual([]);
});
