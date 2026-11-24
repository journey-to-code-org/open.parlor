// The front page as a browser with JavaScript off meets it: the app draws everything in the browser,
// so without a script it would be an empty green page. Instead it says why and where to go (the
// <noscript> block in the web app's index.html, with the server's script-free pages linked in by
// packages/server/src/nojs.ts). With JavaScript on, none of that shows.
import { expect, test } from "@playwright/test";

test.describe("with JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  test("the front page says the games need JavaScript, instead of showing nothing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The games need JavaScript");
    await expect(page.locator("main.nojs")).toContainText("Switch JavaScript on for this site");
    // The app's own mount point is out of the way, and the message is in view without scrolling away to find it.
    await expect(page.locator("#root")).toBeHidden();
    await expect(page.locator("main.nojs")).toBeInViewport();
  });

  test("it links the two pages the server draws, and they open", async ({ page }) => {
    await page.goto("/");
    const links = page.locator("main.nojs .works a");
    await expect(links).toHaveText(["the list of games", "the daily sudoku"]);
    await links.first().click();
    await expect(page).toHaveURL(/\/games$/);
    await expect(page.locator("games-page content-card h3").first()).toHaveText("Spades");
    await page.goBack();
    await links.last().click();
    await expect(page).toHaveURL(/\/daily$/);
    await expect(page.locator("daily-sudoku input").first()).toBeAttached();
  });

  test("a link to one game gets the same message", async ({ page }) => {
    await page.goto("/?game=chess");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The games need JavaScript");
  });

  test("the message fits a phone's width with nothing running off the side", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/");
    await expect(page.locator("main.nojs")).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(wide).toBe(false);
  });
});

test.describe("with JavaScript on", () => {
  test("the message is not on the page, and the app is", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#root")).toBeVisible();
    await expect(page.locator("main.nojs")).toHaveCount(0);
    await expect(page.getByText("The games need JavaScript")).toHaveCount(0);
  });
});
