// A house's page: the invite, the tables, the tournaments, the family and the standings. The owner
// makes the house over the API (with the browser's own cookie); a second browser comes in by the
// invite link.
import { expect, test } from "@playwright/test";

test("a house: invited in, tables, tournaments, family and standings", async ({ page, browser }) => {
  const tag = Math.random().toString(36).slice(2, 6);
  const made = await page.request.post("/houses", { data: { name: `Porch ${tag}`, you: `Owner${tag}` } });
  expect(made.ok(), await made.text()).toBe(true);
  const house = (await made.json()) as { slug: string; code: string };

  // The guest comes in by the link, with no name: no way in until there is one.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/?house=${house.slug}&code=${house.code}`);
  await expect(guest.getByText("You're invited to")).toBeVisible();
  await expect(guest.getByRole("heading", { name: `Porch ${tag}` })).toBeVisible();
  await guest.getByLabel("Your spades name").fill("");
  await expect(guest.getByRole("button", { name: "Come on in" })).toBeDisabled();
  await guest.getByLabel("Your spades name").fill(`Guest${tag}`);
  await guest.getByRole("button", { name: "Come on in" }).click();
  await expect(guest.getByText(`Welcome back, Guest${tag}.`)).toBeVisible();
  // A member doesn't manage: no tournament to start, no family buttons.
  const guestFamily = guest.getByRole("region", { name: "Family" });
  await expect(guestFamily.getByText(`you · member`)).toBeVisible();
  await expect(guestFamily.getByRole("button", { name: "Make admin" })).toHaveCount(0);
  await expect(guest.getByRole("region", { name: "Tournaments" })).toContainText("No tournaments yet.");

  // The owner's page.
  await page.goto(`/?house=${house.slug}`);
  await expect(page.getByText(`Welcome back, Owner${tag}.`)).toBeVisible();
  const tables = page.getByRole("region", { name: "Tables" });
  await expect(tables).toContainText("No tables yet.");
  await expect(page.getByRole("region", { name: "Tournaments" })).toContainText("Run a bracket");
  await expect(page.getByRole("region", { name: "Leaderboard" })).toContainText("Standings start after the first finished game.");

  // A table opened elsewhere shows up, and opens.
  const opened = await page.request.post(`/houses/${house.slug}/tables`, { data: { game: "spades" } });
  expect(opened.ok(), await opened.text()).toBe(true);
  const { id } = (await opened.json()) as { id: string };
  await page.reload();
  await expect(tables.getByRole("listitem")).toHaveCount(1);
  await expect(tables.getByRole("listitem")).toContainText(/seated|Waiting for players/);

  // The family: the owner makes the guest an admin, then back, then removes them.
  const family = page.getByRole("region", { name: "Family" });
  const row = family.getByRole("listitem").filter({ hasText: `Guest${tag}` });
  await expect(family.getByRole("listitem").filter({ hasText: `Owner${tag}` })).toContainText("you · owner");
  await row.getByRole("button", { name: "Make admin" }).click();
  await expect(row).toContainText("admin");
  await row.getByRole("button", { name: "Make member" }).click();
  await expect(row).toContainText("member");
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(family.getByRole("listitem")).toHaveCount(1);

  // Another game's standings take the spades board's place (the game is kept from last time).
  await page.evaluate(() => localStorage.setItem("cardroom:game", JSON.stringify("palace")));
  await page.reload();
  await expect(page.getByRole("region", { name: "Palace leaderboard" })).toContainText("Standings start after the first finished Palace game.");
  await expect(page.getByRole("region", { name: "Leaderboard", exact: true })).toHaveCount(0);

  await tables.getByRole("listitem").getByRole("button").click();
  await expect(page).toHaveURL(new RegExp(`table=${id}`));
  await guestContext.close();
});
