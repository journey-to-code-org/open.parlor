// The tables played for chips, on a short desktop window, hand after hand: your buttons are never
// under your own seat and hand (which stay on screen at the bottom), and the seat across the table
// stays inside its rail.
//
// #359: on a 1600×779 window, Hold'em in 3-D grew taller than the window once the board had cards on
// it, and Fold, Call and Raise were left under your seat, where no click reaches them. The first
// hand was fine, which is all the phone-layout test opens. Chrome only: this is the parlor's layout.
import { expect, test, type Page } from "@playwright/test";

/** The buttons a click doesn't reach: something else is on top of their middle. */
function covered(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".kit-choices button")].flatMap((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit && (hit === b || b.contains(hit)) ? [] : [`${b.textContent?.trim()} (under ${hit ? hit.className || hit.tagName : "nothing: off the screen"})`];
    }),
  );
}

/** How far the seat across the table stands out over the top of the felt, in pixels (0: inside it). */
function overTheRail(page: Page): Promise<number> {
  return page.evaluate(() => {
    const seat = document.querySelector(".opp-area.top .kit-seat")?.getBoundingClientRect();
    const felt = document.querySelector(".kit-felt")?.getBoundingClientRect();
    return seat && felt ? Math.max(0, Math.round(felt.top - seat.top)) : 0;
  });
}

// The three chip games in 3-D, where #359 was; and Hold'em flat, the fallback, once.
for (const [game, depth] of [["holdem", "3d"], ["fivedraw", "3d"], ["blackjack", "3d"], ["holdem", "flat"]] as const) {
  test(`${game}, ${depth}, on a 1600×779 window: every turn's buttons can be pressed`, async ({ browser, browserName }) => {
      test.skip(browserName !== "chromium", "The layout is the parlor's own; Chrome checks it.");
      test.setTimeout(240_000);
      const page = await browser.newPage({ viewport: { width: 1600, height: 779 } });
      await page.addInitScript((d) => localStorage.setItem("cardroom:display", JSON.stringify({ motion: "off", suits: 2, view: "angled", depth: d, coords: true, placing: "auto" })), depth);
      await page.goto(`/?game=${game}`);
      await page.getByRole("button", { name: /^(Practice against the computer|Deal|Play)$/ }).first().click();
      for (let i = 0; i < 3; i++) {
        const tip = page.getByRole("button", { name: "Got it" });
        if (!(await tip.count())) break;
        await tip.first().click();
      }
      // Raise where it can, so pots grow and the pile in the middle gets tall: #359 needed a pot of
      // about 100 and cards on the board before the table outgrew the window.
      const play = page.locator(".kit-choices button").filter({ hasText: /^(Raise|Check|Call|Bet 10|Stand|Keep them all|Next round|Next hand)/ });
      // At Blackjack the smallest bet, so the chips last.
      const order = game === "blackjack" ? [/^Bet 10/, /^Stand/, /^Next round/] : [/^Raise/, /^Call/, /^Check/, /^Keep them all/, /^Next hand/];
      const pick = async () => {
        for (const word of order) {
          const b = page.locator(".kit-choices button").filter({ hasText: word });
          if (await b.count()) return b.first();
        }
        return play.first();
      };
      const next = page.locator(".sheet button.primary");
      /** The turns looked at, and (in Hold'em) those with a big pot and cards on the board. */
      let turns = 0;
      let big = 0;
      const deadline = Date.now() + 150_000;
      while ((big < 2 || turns < 8) && Date.now() < deadline) {
        await expect(play.or(next).first()).toBeVisible({ timeout: 20_000 });
        if (await next.count()) {
          await next.first().click();
          continue;
        }
        // Wait for any scroll that brings the buttons up from under your seat.
        await page.waitForTimeout(400);
        const where = `turn ${turns + 1}`;
        expect(await covered(page), where).toEqual([]);
        expect(await overTheRail(page), `${where}: the seat across the table`).toBeLessThanOrEqual(2);
        // Read now, without waiting: Blackjack has no pot.
        const pot = (await page.locator(".kit-info li").allTextContents()).find((line) => /^Pot \d+/.test(line));
        const board = await page.locator(".kit-felt .pile-card, .kit-felt .pile-spread-row > *").count();
        const potSize = Number(/\d+/.exec(pot ?? "")?.[0] ?? 0);
        // Hold'em is where #359 was reproduced: there, it has to be looked at with a big pot and
        // the board out. Five Card Draw's players fold to raises, so its pots stay small.
        if (game !== "holdem" || (potSize >= 60 && board >= 3)) big++;
        await (await pick()).click();
        turns++;
      }
      expect(big, "turns with a big pot looked at").toBeGreaterThanOrEqual(2);
      await page.close();
  });
}
