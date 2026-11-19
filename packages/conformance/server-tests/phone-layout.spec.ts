// Every game on a phone: its practice table opened at 390×844 with touch, then every control on the
// screen looked at. A button off the side of the screen, or one that nothing on screen lets you
// reach (something else is on top of every part of it, wherever it scrolls to), fails the game.
//
// Each of these got past us: Klondike's stock was pushed off the left edge (#299), Memory's grid of
// cards was cut in half, and Liar's Poker's higher bids ran down under the hand. Each one is a
// screen's CSS on a narrow screen, and no test opened it there.
//
// The games come from /games (the page the server draws), so a new game is checked without
// anyone adding it here. Chrome only: this is about the parlor's own layout, not the engines'.
import { expect, test, type Page } from "@playwright/test";

/** The buttons that start a game against the computer here, in the order a setup screen has them. */
const START = /^(Practice against the computer|Deal|Play)$/;

/** A control a person can't reach, and why. */
interface Problem {
  name: string;
  why: string;
}

/** Looks at every control on the screen; each one is scrolled into view first, as a person would. */
function problems(page: Page): Promise<Problem[]> {
  return page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const found: { name: string; why: string }[] = [];
    const shown = (e: Element) => {
      if (!e.getClientRects().length) return false;
      const style = getComputedStyle(e);
      if (style.visibility === "hidden" || Number(style.opacity) === 0)
        return false;
      const box = e.getBoundingClientRect();
      return box.width >= 2 && box.height >= 2;
    };
    /** Inside a strip that scrolls sideways (the shelf of chips, a long hand): off the edge is fine there. */
    const inSideScroller = (e: Element) => {
      for (
        let up = e.parentElement;
        up && up !== document.body;
        up = up.parentElement
      ) {
        if (
          /(auto|scroll)/.test(getComputedStyle(up).overflowX) &&
          up.scrollWidth > up.clientWidth + 1
        )
          return true;
      }
      return false;
    };
    if (document.scrollingElement!.scrollWidth > vw + 1)
      found.push({
        name: "the page",
        why: `is ${document.scrollingElement!.scrollWidth}px wide on a ${vw}px screen`,
      });
    for (const e of document.querySelectorAll(
      "button, a[href], input, select, textarea, [role=button]",
    )) {
      if (!shown(e) || inSideScroller(e) || (e as HTMLButtonElement).disabled)
        continue;
      const name = (e.getAttribute("aria-label") || e.textContent || e.tagName)
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);
      e.scrollIntoView({ block: "center", inline: "nearest" });
      const box = e.getBoundingClientRect();
      if (box.right < 1 || box.left > vw - 1) {
        found.push({
          name,
          why: `is off the screen (${Math.round(box.left)} to ${Math.round(box.right)})`,
        });
        continue;
      }
      if (box.left < -2 || box.right > vw + 2) {
        found.push({
          name,
          why: `is cut off at the edge (${Math.round(box.left)} to ${Math.round(box.right)})`,
        });
        continue;
      }
      if (box.top < 0 || box.bottom > vh) continue;
      // Reachable if any point of a 5×5 grid on it is the control itself: a card in a fan shows only an edge.
      let reachable = false;
      let over: Element | null = null;
      for (let i = 1; i <= 5 && !reachable; i++) {
        for (let j = 1; j <= 5 && !reachable; j++) {
          const top = document.elementFromPoint(
            Math.min(vw - 1, Math.max(0, box.left + (box.width * i) / 6)),
            Math.min(vh - 1, box.top + (box.height * j) / 6),
          );
          if (!top || e.contains(top) || top.contains(e)) reachable = true;
          else over = top;
        }
      }
      if (!reachable)
        found.push({
          name,
          why: `is under ${over?.getAttribute("aria-label") || over?.className?.toString() || over?.tagName}`,
        });
    }
    return found;
  });
}

/** Opens a game's practice table (or leaves it at the setup screen, for a game with no practice). */
async function open(page: Page, href: string) {
  await page.goto(href);
  const start = page.getByRole("button", { name: START });
  await start
    .first()
    .waitFor({ timeout: 8_000 })
    .catch(() => {});
  if (await start.count()) {
    await start.first().click();
    // The table, then the first-time tips over it.
    await page.waitForTimeout(1_500);
    for (let i = 0; i < 3; i++) {
      const tip = page.getByRole("button", { name: "Got it" });
      if (!(await tip.count())) break;
      await tip.first().click();
      await page.waitForTimeout(300);
    }
  }
  await page.waitForTimeout(500);
}

test.describe("on a phone", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The layout is the parlor's own; Chrome checks it.",
  );

  test("every game's table has every control on the screen and within reach", async ({
    browser,
  }) => {
    test.setTimeout(15 * 60_000);
    // The list, from the page the server draws (with JavaScript off it's plain links).
    const lister = await browser.newPage({ javaScriptEnabled: false });
    await lister.goto("/games");
    const hrefs = [
      ...new Set(
        await lister
          .locator('a[href^="/?game="]')
          .evaluateAll((links) => links.map((a) => a.getAttribute("href")!)),
      ),
    ];
    await lister.close();
    expect(hrefs.length).toBeGreaterThan(20);

    const failures: string[] = [];
    // One at a time: the other test files run beside this one, and four phones at once slowed them past their limits.
    const queue = [...hrefs];
    const worker = async () => {
      for (let href = queue.shift(); href; href = queue.shift()) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        });
        // Past the newcomer's intro, which only the front page shows anyway.
        await context.addInitScript(() =>
          localStorage.setItem("parlor.intro", "seen"),
        );
        const page = await context.newPage();
        try {
          await open(page, href);
          for (const p of await problems(page))
            failures.push(`${href}: “${p.name}” ${p.why}`);
        } catch (error) {
          failures.push(
            `${href}: didn't open (${(error as Error).message.split("\n")[0]})`,
          );
        } finally {
          await context.close();
        }
      }
    };
    await worker();
    failures.sort();
    expect(
      failures,
      `Controls out of reach on a phone:\n${failures.join("\n")}`,
    ).toEqual([]);
  });
});
