// The lobby: every table waiting for players, whatever the game. Two people open tables for two
// games; a third finds them, filters to one game, and jumps into a seat. The server is shared by
// every browser at once, so each browser opens tables of its own games and looks for its own names.
import { expect, request, test } from "@playwright/test";

const GAMES: Record<string, [string, string]> = { chrome: ["ohhell", "euchre"], firefox: ["whist", "pitch"], webkit: ["durak", "crazy8"] };
const NAMES: Record<string, string> = { ohhell: "Oh Hell", euchre: "Euchre", whist: "Whist", pitch: "Pitch", durak: "Durak", crazy8: "Crazy Eights" };

test("open tables: listed, filtered by game, and a seat taken", async ({ page }, info) => {
  const [one, two] = GAMES[info.project.name] ?? GAMES.chrome!;
  const tag = Math.random().toString(36).slice(2, 6);
  // A table left waiting by an earlier run (a retry) would be joined instead of a new one opened, so
  // stand-ins fill those first: a full table starts and leaves the lobby.
  const someone = () => request.newContext({ baseURL: "http://localhost:4180" });
  for (const game of [one, two]) {
    const { tables } = await (await (await someone()).get(`/lobby?game=${game}`)).json();
    for (const t of tables as { id: string; free: number }[]) {
      for (let i = 0; i < t.free; i++) await (await someone()).post(`/lobby/${t.id}/sit`, { data: { name: `Fill${tag}` } });
    }
  }
  for (const [game, name] of [[one, `Ann${tag}`], [two, `Bo${tag}`]] as const) {
    const r = await (await someone()).post("/lobby/join", { data: { game, name, sameRules: true } });
    expect(r.ok(), await r.text()).toBe(true);
    expect((await r.json()).waiting).toBe(true);
  }

  await page.goto("/?lobby=1");
  await expect(page.getByRole("heading", { name: "Open tables" })).toBeVisible();
  const list = page.getByRole("list", { name: "Open tables" });
  const mine = (who: string) => list.getByRole("listitem").filter({ hasText: who });
  await expect(mine(`Ann${tag}`)).toContainText(NAMES[one]!);
  await expect(mine(`Bo${tag}`)).toContainText(NAMES[two]!);
  await expect(mine(`Ann${tag}`)).toContainText(/seats open/);

  // A filter, once there's more than one game waiting.
  await page.getByLabel("Game", { exact: true }).selectOption({ label: NAMES[one]! });
  await expect(mine(`Bo${tag}`)).toHaveCount(0);
  await expect(mine(`Ann${tag}`)).toBeVisible();
  await page.getByLabel("Game", { exact: true }).selectOption({ label: "Any game" });
  await expect(mine(`Bo${tag}`)).toBeVisible();

  // No name, no seat.
  const name = page.getByLabel("Your name");
  await name.fill("");
  await expect(mine(`Ann${tag}`).getByRole("button", { name: "Jump in" })).toBeDisabled();
  await name.fill(`Cy${tag}`);
  await mine(`Ann${tag}`).getByRole("button", { name: "Jump in" }).click();
  await expect(page).toHaveURL(/[?&]table=/);
  const at = new URL(page.url()).searchParams.get("table");
  const seated = (await (await page.request.get(`/lobby?game=${one}`)).json()).tables.find((t: { id: string }) => t.id === at);
  expect(seated?.seat ?? null, "the seat taken").not.toBeNull();
  await expect(page.getByRole("heading", { name: "Open tables" })).toHaveCount(0);

  // Leaving a table's page gives the seat up, so a table you're at is seen from a seat taken without
  // the page: Bo's, taken through this browser's own cookie.
  await page.goto("/?lobby=1");
  const { tables } = await (await page.request.get(`/lobby?game=${two}`)).json();
  const bo = (tables as { id: string; seats: { name: string | null }[] }[]).find((t) => t.seats.some((x) => x.name === `Bo${tag}`))!;
  expect((await page.request.post(`/lobby/${bo.id}/sit`, { data: { name: `Cy${tag}` } })).ok()).toBe(true);
  await expect(mine(`Bo${tag}`)).toContainText("you're here");
  await expect(mine(`Bo${tag}`).getByRole("button", { name: "Go back" })).toBeEnabled();
});
