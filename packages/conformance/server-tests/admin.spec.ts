// The admin app (packages/admin, Angular on the parlor's Zubra components), as the parlor's host
// uses it against a real server: sign in, look at a table and what's been said there, remove a
// message, close the table, block and unblock a player, rename a house, switch a game off and move
// it. The server is shared by every browser at once, so each test makes its own table, players and
// house, and each browser changes a different game and puts it back.
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";

const TOKEN = "let-the-host-in";
const BASE = "http://localhost:4180";
const PALACE = { options: { game: "palace", rules: { id: "family-palace", name: "Family Palace" }, seats: 2 } };

/** Someone's phone: its own cookie, so its own player. */
const phone = () => request.newContext({ baseURL: BASE });
async function send(who: APIRequestContext, path: string, body: unknown) {
  const r = await who.post(path, { data: body });
  expect(r.ok(), `${path}: ${await r.text()}`).toBe(true);
  return (await r.json()) as Record<string, unknown>;
}
/** A Palace table with two people at it who've said something. */
async function table(tag: string) {
  const [a, b] = [await phone(), await phone()];
  const id = (await send(a, "/rooms", PALACE)).id as string;
  await send(a, `/rooms/${id}/sit`, { seat: 0, name: `Ann ${tag}` });
  await send(b, `/rooms/${id}/sit`, { seat: 1, name: `Bo ${tag}` });
  await send(a, `/rooms/${id}/say`, { text: `hello from ${tag}` });
  await send(b, `/rooms/${id}/say`, { text: `rude words ${tag}` });
  return { id, names: [`Ann ${tag}`, `Bo ${tag}`] };
}
const tag = () => Math.random().toString(36).slice(2, 7);

async function signIn(page: Page) {
  await page.goto("/admin/");
  await page.getByLabel("Admin token").fill(TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Playing now")).toBeVisible();
}
const section = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();
const dialog = (page: Page) => page.locator("dialog[open]");

test("a wrong token is turned away, and the right one opens the overview", async ({ page }) => {
  await page.goto("/admin/");
  await page.getByLabel("Admin token").fill("not it");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That isn't this parlor's admin token.")).toBeVisible();
  await page.getByLabel("Admin token").fill(TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Playing now")).toBeVisible();
  // The token is kept for the tab: a reload stays signed in.
  await page.reload();
  await expect(page.getByText("Playing now")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Admin token")).toBeVisible();
});

test("a table: who's there, what's been said, a message removed, and the table closed", async ({ page }) => {
  const t = tag();
  const { id, names } = await table(t);
  await signIn(page);
  await section(page, "Tables");
  await page.getByRole("checkbox", { name: new RegExp(`^Select ${id}`) }).check();
  await page.getByRole("button", { name: "Look at table" }).click();
  await expect(dialog(page)).toContainText(names[0]!);
  await expect(dialog(page)).toContainText(names[1]!);
  await expect(dialog(page)).toContainText(`rude words ${t}`);
  await dialog(page).getByRole("button", { name: `Remove ${names[1]}’s message` }).click();
  await expect(page.getByText("Removed the message.")).toBeVisible();
  await expect(dialog(page).locator("li.gone")).toContainText(`${names[1]} (removed by a moderator)`);
  await expect(dialog(page)).not.toContainText(`rude words ${t}`);

  await dialog(page).getByRole("button", { name: "Close this table" }).click();
  const asking = page.getByRole("dialog", { name: `Close Palace table ${id}?` });
  await asking.getByLabel("Reason").fill("Closed by the tests");
  await asking.getByRole("button", { name: "Close table" }).click();
  await expect(page.getByText(`Closed table ${id}.`)).toBeVisible();
  await section(page, "Activity");
  await expect(page.getByRole("table", { name: "Activity" })).toContainText("Closed by the tests");
});

test("a player blocked with a reason, and unblocked", async ({ page }) => {
  const t = tag();
  const { names } = await table(t);
  await signIn(page);
  await section(page, "Players");
  await page.getByRole("checkbox", { name: `Select ${names[1]}` }).check();
  await page.getByRole("button", { name: "Block player" }).click();
  await dialog(page).getByLabel("Reason").fill(`spam ${t}`);
  await dialog(page).getByRole("button", { name: "Block player" }).click();
  await expect(page.getByText(`Blocked ${names[1]}.`)).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(names[1]!) });
  await expect(row).toContainText(`Blocked: spam ${t}`);
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Unblock" }).click();
  await expect(page.getByText(`Unblocked ${names[1]}.`)).toBeVisible();
  await expect(page.getByRole("table", { name: "Players" })).not.toContainText(`spam ${t}`);
});

test("a house renamed", async ({ page }) => {
  const t = tag();
  await send(await phone(), "/houses", { name: `House ${t}`, you: `Owner ${t}` });
  await signIn(page);
  await section(page, "Houses");
  const card = page.locator("content-card", { hasText: `House ${t}` });
  await card.getByRole("button", { name: "Rename" }).click();
  await expect(dialog(page).getByLabel("House name")).toHaveValue(`House ${t}`);
  await dialog(page).getByLabel("House name").fill(`Home ${t}`);
  await dialog(page).getByRole("button", { name: "Rename house" }).click();
  await expect(page.getByText(`Renamed the house to Home ${t}.`)).toBeVisible();
  await expect(page.locator("content-card", { hasText: `Home ${t}` })).toBeVisible();
});

test("a game switched off and moved, then put back", async ({ page }, info) => {
  await signIn(page);
  await section(page, "Games");
  const rows = page.locator("ol.games > li");
  await expect(rows.first()).toBeVisible();
  // Each browser a different game, near the end of the list: the games page's tests read the top.
  const at = (await rows.count()) - 2 - ["chrome", "firefox", "webkit"].indexOf(info.project.name) * 2;
  const labelAt = (i: number) => rows.nth(i).locator("toggle-switch").evaluate((el) => (el as HTMLElement & { label: string }).label);
  const name = await labelAt(at);
  const game = rows.nth(at).getByRole("switch");
  await expect(game).toHaveAttribute("aria-checked", "true");
  await game.click();
  await expect(game).toHaveAttribute("aria-checked", "false");
  await expect(rows.nth(at)).toHaveClass(/\boff\b/);
  await page.getByRole("button", { name: `Move ${name} down` }).click();
  await expect.poll(() => labelAt(at + 1)).toBe(name);
  // The server kept both.
  await page.reload();
  await section(page, "Games");
  await expect.poll(() => labelAt(at + 1)).toBe(name);
  await expect(rows.nth(at + 1).getByRole("switch")).toHaveAttribute("aria-checked", "false");

  await page.getByRole("button", { name: `Move ${name} up` }).click();
  await expect.poll(() => labelAt(at)).toBe(name);
  await rows.nth(at).getByRole("switch").click();
  await expect(rows.nth(at).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(rows.nth(at)).not.toHaveClass(/\boff\b/);
});
