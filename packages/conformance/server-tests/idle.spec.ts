// What Delbie's Counter puts over the store: the incident report from while you were out, and the
// question before closing the store for good. (The other two, moving the store and choosing between
// two stores of yours in a house, need a store far along or a house; they share the same sheet.)
import { expect, test } from "@playwright/test";

test("the report from while you were out, and closing the store or keeping it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-11-18T09:00:00") });
  await page.goto("/?game=delbies");
  const howto = page.getByRole("button", { name: "Got it" });
  await page.clock.runFor(1_000);
  if (await howto.isVisible()) await howto.click();
  await expect(page.getByRole("button", { name: "Close the store and start again" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Move the store" })).toBeDisabled();
  await page.clock.runFor(6_000); // the store saves itself every few seconds

  // Three hours later, the store has been running without you. Away means away: the page is left
  // first (it saves as it goes), and the clock moves on while nothing of the store is running. Moved
  // with the page still open, a timer firing after the jump (the store's tick, or its save as the
  // page went) could run the store on to the new time itself, leaving nothing to report: Firefox
  // sometimes fired one, Chrome never did.
  await page.goto("about:blank");
  await page.clock.setSystemTime(new Date("2026-11-18T12:00:00"));
  await page.goto("/?game=delbies");
  await page.clock.runFor(1_000);
  const report = page.getByRole("dialog", { name: "While you were out" });
  await expect(report).toBeVisible({ timeout: 15_000 });
  await expect(report.getByRole("heading", { name: "The incident report" })).toBeVisible();
  await expect(report.locator("li").first()).toBeVisible();
  await expect(report.getByRole("button", { name: "Back to work" })).toBeFocused();
  await report.getByRole("button", { name: "Back to work" }).click();
  await expect(report).toHaveCount(0);

  // Closing the store asks first: keeping it is the answer that's ready.
  await page.getByRole("button", { name: "Close the store and start again" }).click();
  const asking = page.getByRole("dialog", { name: "Start again?" });
  await expect(asking.getByRole("heading", { name: "Close the store?" })).toBeVisible();
  await expect(asking.getByRole("button", { name: "Keep the store" })).toBeFocused();
  await asking.getByRole("button", { name: "Keep the store" }).click();
  await expect(asking).toHaveCount(0);
  await page.getByRole("button", { name: "Close the store and start again" }).click();
  await asking.getByRole("button", { name: "Close it and start again" }).click();
  await expect(asking).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close the store and start again" })).toBeVisible();
  expect(errors).toEqual([]);
});
