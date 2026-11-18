// A table on this wifi, as two devices play it: the host's screen, the guest's, the two codes
// carried between them, and the game starting on both. The channel is WebRTC with no server, so
// the two pages here are on one machine, which is the same wifi as far as it goes.
import { expect, test, type Browser, type Page } from "@playwright/test";

// Chrome offers its local addresses as made-up .local names unless told not to; on a test machine
// nothing answers for those names, so the two pages would never find each other.
test.use({ launchOptions: { args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] } });
// That switch is Chrome's; Firefox and WebKit hide local addresses their own ways, with nothing to
// turn it off from a test. These run in Chrome only.
test.skip(({ browserName }) => browserName !== "chromium", "WebRTC between two pages needs Chrome's local addresses");

/** The host's page, told it's offline (the browser's own offline mode would stop the channel too), at Hearts' setup. */
async function hosting(browser: Browser) {
  const host = await (await browser.newContext()).newPage();
  await host.addInitScript(() => Object.defineProperty(Navigator.prototype, "onLine", { get: () => false }));
  await host.goto("/?game=hearts");
  await host.getByRole("button", { name: "📶 Play on this wifi" }).click();
  await expect(host.getByRole("heading", { name: /on this wifi/ })).toBeVisible();
  return host;
}
/** The link the host's screen offers, as an address on this server. */
async function offered(host: Page, label: string) {
  const link = host.getByLabel(label);
  await expect(link).toHaveValue(/wifi=/, { timeout: 15_000 });
  return (await link.inputValue()).replace(/^https?:\/\/[^/]+/, "");
}
/** The guest's code, once its screen shows one. */
async function answer(guest: Page) {
  await expect(guest.getByRole("heading", { name: "Now show this to the host" })).toBeVisible({ timeout: 15_000 });
  return guest.getByLabel("Your code").inputValue();
}

test("a guest joins the host's table with the two codes, and the game starts on both", async ({ browser }) => {
  const host = await hosting(browser);
  await expect(host.getByRole("button", { name: "Waiting for someone to join" })).toBeDisabled();
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(await offered(host, "The link that joins this table"));
  await expect(guest.getByRole("heading", { name: "Now show this to the host" })).toBeVisible({ timeout: 15_000 });
  await guest.getByLabel("Your name").fill("Gus");
  const code = await answer(guest);

  await host.getByLabel("Their code").fill(code);
  await host.getByRole("button", { name: "Connect" }).click();
  await expect(guest.getByRole("heading", { name: "You're in" })).toBeVisible({ timeout: 20_000 });
  await expect(host.getByRole("region", { name: "At the table" })).toContainText("Gus");
  await expect(guest.getByText(/At the table: .*Gus/)).toBeVisible();
  await expect(host.getByRole("button", { name: "Start with 2 computer players" })).toBeEnabled();

  await host.getByRole("button", { name: /Start/ }).click();
  await expect(host.getByRole("heading", { name: /on this wifi/ })).toHaveCount(0);
  // A first table shows how to play.
  await host.getByRole("button", { name: "Got it" }).click();
  await expect(guest.getByRole("heading", { name: "You're in" })).toHaveCount(0, { timeout: 15_000 });

  // The guest leaves the table: the host lets them back in to the same seat, with two new codes.
  guest.on("dialog", (dialog) => void dialog.accept());
  const howto = guest.getByRole("button", { name: "Got it" });
  if (await howto.isVisible().catch(() => false)) await howto.click();
  await guest.getByRole("button", { name: "Leave game" }).click();
  await guest.context().close();
  const back = host.getByRole("button", { name: "Let Gus back in" });
  await expect(back).toBeVisible({ timeout: 15_000 });
  await back.click();
  const dialog = host.getByRole("dialog", { name: "Let Gus back in" });
  await expect(dialog).toBeVisible();
  const again = await (await browser.newContext()).newPage();
  await again.goto(await offered(host, "The link that lets them back in"));
  const second = await answer(again);
  await dialog.getByLabel("Their code").fill(second);
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });
  await expect(back).toHaveCount(0);
  await expect(again.getByRole("heading", { name: "Now show this to the host" })).toHaveCount(0, { timeout: 15_000 });

  // The host leaves: the guest is told the table has closed.
  await host.context().close();
  await expect(again.getByRole("heading", { name: "The table has closed" })).toBeVisible({ timeout: 20_000 });
  await again.getByRole("button", { name: "📷 Scan the host's new code" }).click();
  await expect(again.getByRole("heading", { name: "Scan the host's code" })).toBeVisible();
  await again.context().close();
});

test("a guest can start from the front page and paste the host's link; a bad code says so", async ({ browser }) => {
  const host = await hosting(browser);
  const link = await offered(host, "The link that joins this table");
  const guest = await (await browser.newContext()).newPage();
  await guest.goto("/?wifi=join");
  await expect(guest.getByRole("heading", { name: "Join a table on this wifi" })).toBeVisible();
  await guest.getByLabel("The host's link").fill("not a code");
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(guest.locator(".error")).toBeVisible();
  await guest.getByLabel("The host's link").fill(`http://localhost:4180${link}`);
  await guest.getByRole("button", { name: "Join" }).click();
  const code = await answer(guest);
  await host.getByLabel("Their code").fill("nonsense");
  await host.getByRole("button", { name: "Connect" }).click();
  await expect(host.locator(".error")).toBeVisible();
  await host.getByLabel("Their code").fill(code);
  await host.getByRole("button", { name: "Connect" }).click();
  await expect(guest.getByRole("heading", { name: "You're in" })).toBeVisible({ timeout: 20_000 });
  await host.context().close();
  await guest.context().close();
});
