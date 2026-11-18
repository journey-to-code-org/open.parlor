// /daily, the sudoku the parlor's server draws, as a person meets it: first with JavaScript off, where
// the grid is a plain form posted to the server, then with it on, where the components take over the
// same HTML. The server keeps the answer; the tests take it from the same function the server uses,
// which is the one thing a player never gets. 2026-11-18 is the first day, so it is never "the future".
import { expect, test, type Page } from "@playwright/test";
import { puzzleFor } from "../../server/src/sudoku.ts";

const DAY = "2026-11-18";
const puzzle = puzzleFor(DAY);
const blanks = [...puzzle.givens].flatMap((d, i) => (d === "0" ? [i] : []));
const cell = (page: Page, i: number) => page.locator(`daily-sudoku input[data-i="${i}"]`);
const banner = (page: Page) => page.locator("daily-sudoku alert-banner");
const check = (page: Page) => page.locator("daily-sudoku button[type=submit]").click();
/** Whether a component has started in the browser. */
const started = (page: Page, tag: string) =>
  page.waitForFunction((name) => {
    try {
      return !!document.querySelector(name)?.matches(":state(hydrated)");
    } catch {
      return false;
    }
  }, tag);
/** Types the answer into every blank cell except those listed, and the wrong digit into `wrong`. */
async function fill(page: Page, { except = [] as number[], wrong = [] as number[] } = {}) {
  for (const i of blanks) {
    if (except.includes(i)) continue;
    const right = Number(puzzle.solution[i]);
    await cell(page, i).fill(String(wrong.includes(i) ? (right % 9) + 1 : right));
  }
}

test.describe("with JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  test("the puzzle is on the page as a grid of inputs, with the clues and not the answer", async ({ page }) => {
    await page.goto(`/daily?d=${DAY}`);
    await expect(page.locator("daily-sudoku input")).toHaveCount(82); // 81 cells and the date
    await expect(page.locator("daily-sudoku input[readonly]")).toHaveCount(81 - blanks.length);
    await expect(page.locator("daily-sudoku input[name^=c]")).toHaveCount(blanks.length);
    for (const i of blanks.slice(0, 5)) await expect(cell(page, i)).toHaveValue("");
    await expect(cell(page, puzzle.givens.indexOf("1") >= 0 ? puzzle.givens.indexOf("1") : 0)).toHaveAttribute("readonly", "");
    await expect(page.locator("daily-sudoku .count")).toHaveText(`0 of ${blanks.length} cells filled`);
    // The answer is not in what the server sent.
    expect(await page.content()).not.toContain(puzzle.solution);
  });

  test("checking posts the grid, comes back to the same day, and says how it stands once", async ({ page }) => {
    await page.goto(`/daily?d=${DAY}`);
    await fill(page, { except: [blanks[0]!, blanks[1]!], wrong: [blanks[2]!] });
    await check(page);
    await expect(page).toHaveURL(new RegExp(`/daily\\?d=${DAY}$`));
    await expect(banner(page)).toHaveCount(1);
    await expect(banner(page)).toContainText("Not quite");
    await expect(banner(page)).toContainText("1 digit is wrong, and 2 cells are still empty");
    // What was typed is still in the grid.
    await expect(cell(page, blanks[3]!)).toHaveValue(puzzle.solution[blanks[3]!]!);
    await expect(cell(page, blanks[0]!)).toHaveValue("");
    await page.reload();
    await expect(banner(page)).toHaveCount(0);
  });

  test("a finished grid is solved", async ({ page }) => {
    await page.goto(`/daily?d=${DAY}`);
    await fill(page);
    await check(page);
    await expect(banner(page)).toContainText("Solved");
  });

  test("a half-finished grid with no mistakes says so", async ({ page }) => {
    await page.goto(`/daily?d=${DAY}`);
    await fill(page, { except: blanks.slice(0, 10) });
    await check(page);
    await expect(banner(page)).toContainText("Nothing you've put in is wrong, and 10 cells are still empty.");
  });

  test("a day that hasn't come is today's, with nothing after it", async ({ page }) => {
    await page.goto("/daily?d=2999-01-01");
    await expect(page.getByRole("link", { name: /The next day/ })).toHaveCount(0);
    await expect(page.locator("daily-sudoku")).toHaveAttribute("date", /^\d{4}-\d{2}-\d{2}$/);
    expect(await page.locator("daily-sudoku").getAttribute("date")).not.toBe("2999-01-01");
    // Before the first day is the first day.
    await page.goto("/daily?d=1999-01-01");
    await expect(page.locator("daily-sudoku")).toHaveAttribute("date", DAY);
    await expect(page.getByRole("link", { name: /The day before/ })).toHaveCount(0);
  });
});

test.describe("with JavaScript on", () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => (message.type() === "error" || message.type() === "warning") && errors.push(`${message.type()}: ${message.text()}`));
  });
  test.afterEach(() => expect(errors, "errors and warnings on the page").toEqual([]));

  test("a repeat in a row, column or box is marked as it is typed", async ({ page }) => {
    await page.goto(`/daily?d=${DAY}`);
    await started(page, "daily-sudoku");
    // Two blanks in the first row, then the same digit in both (one that isn't a given in that row).
    const row = blanks.filter((i) => i < 9);
    expect(row.length).toBeGreaterThanOrEqual(2);
    const given = [...puzzle.givens.slice(0, 9)].filter((d) => d !== "0");
    const free = "123456789".split("").find((d) => !given.includes(d))!;
    await cell(page, row[0]!).fill(free);
    await expect(page.locator("daily-sudoku .clash")).toHaveCount(0);
    await cell(page, row[1]!).fill(free);
    await expect(page.locator("daily-sudoku .clash")).toHaveCount(2);
    await cell(page, row[1]!).fill("");
    await expect(page.locator("daily-sudoku .clash")).toHaveCount(0);
  });

  test("the arrow keys move between cells", async ({ page }) => {
    await page.goto(`/daily?d=${DAY}`);
    await started(page, "daily-sudoku");
    await cell(page, 0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(cell(page, 1)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(cell(page, 10)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowUp");
    await expect(cell(page, 0)).toBeFocused();
    await page.keyboard.press("ArrowLeft"); // the edge: stays
    await expect(cell(page, 0)).toBeFocused();
  });

  test("checking answers in place, without loading the page again, and what was typed is kept for the day", async ({ page }) => {
    await page.goto(`/daily?d=${DAY}`);
    await started(page, "daily-sudoku");
    await page.evaluate(() => ((window as unknown as { same?: boolean }).same = true));
    const posts: string[] = [];
    page.on("request", (request) => request.method() === "POST" && posts.push(new URL(request.url()).pathname));

    await fill(page, { except: [blanks[0]!], wrong: [blanks[1]!] });
    await expect(page.locator("daily-sudoku .count")).toHaveText(`${blanks.length - 1} of ${blanks.length} cells filled`);
    await check(page);
    await expect(banner(page)).toContainText("1 digit is wrong, and 1 cell is still empty");
    expect(posts).toEqual(["/_zb/action/daily-sudoku/check"]);
    expect(await page.evaluate(() => (window as unknown as { same?: boolean }).same)).toBe(true);

    // Typing again takes the verdict away, and the fix is believed.
    await cell(page, blanks[1]!).fill(puzzle.solution[blanks[1]!]!);
    await cell(page, blanks[0]!).fill(puzzle.solution[blanks[0]!]!);
    await expect(banner(page)).toHaveCount(0);
    await check(page);
    await expect(banner(page)).toContainText("Solved");

    // A new visit to the same day finds the grid as it was left; Clear empties it.
    await page.reload();
    await started(page, "daily-sudoku");
    await expect(cell(page, blanks[5]!)).toHaveValue(puzzle.solution[blanks[5]!]!);
    await page.locator("daily-sudoku button", { hasText: "Clear" }).click();
    await expect(cell(page, blanks[5]!)).toHaveValue("");
    await expect(page.locator("daily-sudoku .count")).toHaveText(`0 of ${blanks.length} cells filled`);
  });

  test("a digit typed over another replaces it, and letters are refused", async ({ page }) => {
    await page.goto(`/daily?d=${DAY}`);
    await started(page, "daily-sudoku");
    const i = blanks[0]!;
    await cell(page, i).fill("4");
    await cell(page, i).focus();
    await page.keyboard.type("7");
    await expect(cell(page, i)).toHaveValue("7");
    await cell(page, i).focus();
    await page.keyboard.type("x");
    await expect(cell(page, i)).toHaveValue("7");
  });

  test("the front page has it on a shelf, and its tile goes to it", async ({ page }) => {
    await page.goto("/");
    // A tile like any other game's, there once the page has asked the server whether it draws one.
    await page.getByRole("button", { name: /^The daily sudoku:/ }).click();
    await expect(page).toHaveURL(/\/daily$/);
    await started(page, "daily-sudoku");
    await expect(page.locator("daily-sudoku input")).toHaveCount(82);
  });
});
