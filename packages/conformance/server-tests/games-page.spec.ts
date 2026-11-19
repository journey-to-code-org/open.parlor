// /games, the page the parlor's server draws with Zubra's server rendering, as a person meets it:
// first with JavaScript off, where everything has to come from the server, then with it on, where
// the components take over the same HTML. (What the HTML holds is tested in the server's own
// pages.test.ts; this is the browser's half.)
import { expect, test, type Page } from "@playwright/test";

const cards = (page: Page) => page.locator("games-page content-card h3");
const banners = (page: Page) => page.locator("game-request alert-banner");
/** Whether a component has started in the browser. */
const started = (page: Page, tag: string) =>
  page.waitForFunction((name) => {
    try {
      return !!document.querySelector(name)?.matches(":state(hydrated)");
    } catch {
      return false;
    }
  }, tag);

test.describe("with JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  test("every game is on the page, and the form asks the server for fewer", async ({ page }) => {
    await page.goto("/games");
    const all = await cards(page).count();
    expect(all).toBeGreaterThan(20);
    await expect(page.locator("games-page .count")).toHaveText(`${all} games`);
    await expect(cards(page).first()).toHaveText("Spades");

    await page.locator("games-page input[name=q]").fill("che");
    await page.locator("games-page select[name=kind]").selectOption("table");
    await page.locator("games-page form button[type=submit]").click();
    await expect(page).toHaveURL(/\/games\?q=che&kind=table$/);
    await expect(cards(page)).toHaveText(["Checkers", "Chess", "Chinese Checkers"]);
    // What was asked for is still in the fields.
    await expect(page.locator("games-page input[name=q]")).toHaveValue("che");
    await expect(page.locator("games-page select[name=kind]")).toHaveValue("table");

    await page.goto("/games?q=zzzz");
    await expect(cards(page)).toHaveCount(0);
    await expect(page.locator("games-page empty-state")).toContainText("No game by that name");
  });

  test("a game's card goes to its setup", async ({ page }) => {
    await page.goto("/games?q=palace");
    await expect(cards(page).locator("a")).toHaveAttribute("href", "/?game=palace");
  });

  test("asking for a game posts the form, comes back to the page, and shows the answer once", async ({ page }) => {
    await page.goto("/games?kind=table");
    await page.locator("game-request input[name=name]").fill("Palace");
    await page.locator("game-request button[type=submit]").click();
    // Back where it was posted from, with what the server's function answered.
    await expect(page).toHaveURL(/\/games\?kind=table$/);
    await expect(banners(page)).toHaveCount(1);
    await expect(banners(page)).toContainText("Palace is already here.");
    await expect(banners(page).locator("a")).toHaveAttribute("href", "/?game=palace");
    await page.reload();
    await expect(banners(page)).toHaveCount(0);
  });
});

test.describe("with JavaScript on", () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      // Firefox reports what a page had in flight when it's left (a click to /games) as an error of
      // the page left behind. That isn't a fault of either page.
      if (message.text().includes("Navigated away from page")) return;
      if (message.type() === "error" || message.type() === "warning") errors.push(`${message.type()}: ${message.text()}`);
    });
  });
  test.afterEach(() => expect(errors, "errors and warnings on the page").toEqual([]));

  test("the components take over the server's page and filter it in place", async ({ page }) => {
    await page.goto("/games");
    await started(page, "games-page");
    const all = await cards(page).count();
    // The button was for a browser without JavaScript.
    await expect(page.locator("games-page form button[type=submit]")).toHaveCount(0);
    // A mark on the page: still there afterwards means nothing was loaded again.
    await page.evaluate(() => ((window as unknown as { same?: boolean }).same = true));

    await page.locator("games-page input[name=q]").fill("ch");
    await expect(cards(page).filter({ hasText: "Chess" })).toHaveCount(1);
    expect(await cards(page).count()).toBeLessThan(all);
    await page.locator("games-page select[name=kind]").selectOption("arcade");
    await expect(cards(page)).toHaveText(["Chip Stack"]);
    await expect(page.locator("games-page .count")).toHaveText("1 game");
    await page.locator("games-page input[name=q]").fill("zzzz");
    await expect(page.locator("games-page empty-state")).toContainText("No game by that name");
    await page.locator("games-page input[name=q]").fill("");
    await page.locator("games-page select[name=kind]").selectOption("all");
    await expect(cards(page)).toHaveCount(all);

    expect(await page.evaluate(() => (window as unknown as { same?: boolean }).same)).toBe(true);
    await expect(page).toHaveURL(/\/games$/);
  });

  test("a page asked for with a filter starts from it", async ({ page }) => {
    await page.goto("/games?q=che&kind=table");
    await started(page, "games-page");
    await expect(cards(page)).toHaveText(["Checkers", "Chess", "Chinese Checkers"]);
    await page.locator("games-page input[name=q]").fill("chess");
    await expect(cards(page)).toHaveText(["Chess"]);
  });

  test("asking for a game answers in place, without loading the page again", async ({ page }) => {
    await page.goto("/games");
    await started(page, "game-request");
    await page.evaluate(() => ((window as unknown as { same?: boolean }).same = true));
    const posts: string[] = [];
    page.on("request", (request) => request.method() === "POST" && posts.push(new URL(request.url()).pathname));

    // The browser's own check stops an empty name before anything is sent.
    await page.locator("game-request button[type=submit]").click();
    await expect(page.locator("game-request input[name=name]")).toHaveJSProperty("validity.valueMissing", true);
    expect(posts).toEqual([]);

    await page.locator("game-request input[name=name]").fill("palace");
    await page.locator("game-request button[type=submit]").click();
    await expect(banners(page)).toHaveCount(1);
    await expect(banners(page)).toContainText("Palace is already here.");
    expect(posts).toEqual(["/_zb/action/game-request/ask"]);
    expect(await page.evaluate(() => (window as unknown as { same?: boolean }).same)).toBe(true);
  });

  test("the front page links to it", async ({ page }) => {
    // Past the newcomer's intro (src/splash): this is about the front page behind it.
    await page.addInitScript(() => localStorage.setItem("parlor.intro", "seen"));
    await page.goto("/");
    await page.getByRole("link", { name: /Every game on one page/ }).click();
    await expect(page).toHaveURL(/\/games$/);
    await expect(cards(page).first()).toHaveText("Spades");
  });
});
