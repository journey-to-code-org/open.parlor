// Holding a game from the admin app: pause a table with a reason, see it paused (and that the players
// can't move), play a seat's turn for someone, and resume. Against a real server, like admin.spec.ts.
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";

const TOKEN = "let-the-host-in";
const BASE = "http://localhost:4180";
const PALACE = { options: { game: "palace", rules: { id: "family-palace", name: "Family Palace" }, seats: 2 } };

const phone = () => request.newContext({ baseURL: BASE });
async function send(who: APIRequestContext, path: string, body: unknown) {
  const r = await who.post(path, { data: body });
  expect(r.ok(), `${path}: ${await r.text()}`).toBe(true);
  return (await r.json()) as Record<string, unknown>;
}
const tag = () => Math.random().toString(36).slice(2, 7);

/** A dealt Palace table with two people at it. */
async function dealt(t: string) {
  const [a, b] = [await phone(), await phone()];
  const id = (await send(a, "/rooms", PALACE)).id as string;
  await send(a, `/rooms/${id}/sit`, { seat: 0, name: `Ann ${t}` });
  await send(b, `/rooms/${id}/sit`, { seat: 1, name: `Bo ${t}` });
  await send(a, `/rooms/${id}/start`, {});
  return { id, a, b, names: [`Ann ${t}`, `Bo ${t}`] };
}

async function signIn(page: Page) {
  await page.goto("/admin/");
  await page.getByLabel("Admin token").fill(TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Playing now")).toBeVisible();
}

test("a game is paused with a reason, a turn is played for a seat, and the game is resumed", async ({ page }) => {
  const { id, a, b, names } = await dealt(tag());
  await signIn(page);
  await page.goto(`/admin/tables/${id}`);
  const one = page.getByRole("dialog", { name: `Palace table ${id}`, exact: true });
  await expect(one).toContainText(names[0]!);

  // Nothing to play for, or resume, until it is paused.
  await expect(one.getByRole("button", { name: "Resume game" })).toBeHidden();
  await expect(one.getByRole("button", { name: /turn for them/ })).toHaveCount(0);

  await one.getByRole("button", { name: "Pause game" }).click();
  const asking = page.getByRole("dialog", { name: `Pause Palace table ${id}?` });
  await asking.getByLabel("Reason").fill("Checking the deal");
  await asking.getByRole("button", { name: "Pause game" }).click();
  await expect(page.getByText(`Paused table ${id}.`)).toBeVisible();
  await expect(one).toContainText("Checking the deal");
  await expect(one.getByRole("button", { name: "Pause game" })).toBeHidden();
  await expect(one).toContainText("The host paused the game: Checking the deal");

  // The players are held.
  for (const who of [a, b]) {
    const refused = await who.post(`/rooms/${id}/act`, { data: { move: { type: "ready" } } });
    expect(refused.status()).toBe(423);
  }

  // The host plays a turn for whichever seat can move.
  let played = false;
  for (const name of names) {
    await one.getByRole("button", { name: `Play ${name}’s turn for them` }).click();
    await page.getByRole("dialog", { name: `Play ${name}'s turn for them?` }).getByRole("button", { name: "Play their turn" }).click();
    try {
      await expect(page.getByText(`Played a turn for ${name}.`, { exact: true })).toBeVisible({ timeout: 3000 });
      played = true;
      break;
    } catch {
      // Not this seat's turn: the toast says so; try the other.
    }
  }
  expect(played).toBe(true);
  await expect(one).toContainText("The host played a turn for");

  await one.getByRole("button", { name: "Resume game" }).click();
  await expect(page.getByText(`Resumed table ${id}.`)).toBeVisible();
  await expect(one.getByRole("button", { name: "Pause game" })).toBeVisible();
  await expect(one).toContainText("The host resumed the game.");
});
