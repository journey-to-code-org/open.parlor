// Opening a pull request from the Tuning page, against a real server and a stand-in GitHub (a small
// server in this file that keeps one branch and the pull requests). Chromium only: it shares the one
// server's saved numbers with the tuning spec.
import { createServer, type Server } from "node:http";
import { expect, request, test, type Page } from "@playwright/test";

test.skip(({ browserName }) => browserName !== "chromium", "One game's numbers, one server: run once");

const TOKEN = "let-the-host-in";
const BASE = "http://localhost:4180";
const REPO = "journey-to-code-org/open.parlor";

interface Seen { method: string; url: string; auth?: string; body?: any }
const seen: Seen[] = [];
let github: Server;

test.beforeAll(async () => {
  const branches = new Set(["main"]);
  github = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : undefined;
      const url = (req.url ?? "").replace(`/repos/${REPO}`, "");
      seen.push({ method: req.method!, url, auth: req.headers.authorization, body });
      const send = (status: number, b: unknown = {}) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(b));
      };
      if (req.method === "GET" && url.startsWith("/git/ref/heads/")) return send(200, { object: { sha: "sha-main" } });
      if (req.method === "GET" && url.startsWith("/contents/")) return send(404);
      if (req.method === "POST" && url === "/git/refs") return branches.add(body.ref) && send(201);
      if (req.method === "PUT" && url.startsWith("/contents/")) return send(201);
      if (req.method === "POST" && url === "/pulls") return send(201, { html_url: `https://github.com/${REPO}/pull/77`, number: 77 });
      send(404);
    });
  });
  await new Promise<void>((done) => github.listen(4181, "127.0.0.1", done));
});
test.afterAll(async () => {
  if (github) await new Promise<void>((done) => github.close(() => done()));
});

async function open(page: Page) {
  await page.goto("/admin/");
  await page.getByLabel("Admin token").fill(TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Playing now")).toBeVisible();
  await page.getByRole("tab", { name: "Tuning", exact: true }).click();
  await expect(page.getByTestId("saved")).toContainText(/Nothing changed|Version \d+/);
  await page.getByLabel("Game", { exact: true }).selectOption({ label: "The daily sudoku" });
}
const weekday = (page: Page, day: string) => page.getByLabel(new RegExp(`^${day}`));

test("saved numbers become a draft pull request, once, and only after they're saved", async ({ page }) => {
  await open(page);
  const promote = page.getByTestId("promote");
  const button = promote.getByRole("button", { name: "Open a pull request" });
  // Nothing saved: nothing to open.
  await expect(button).toBeDisabled();

  // Changed but not saved: still disabled, and says why.
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (const [i, day] of days.entries()) await weekday(page, day).fill(String(41 - i * 2));
  await expect(button).toBeDisabled();
  await expect(promote).toContainText("Save first");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/version \d+ is saved/i).first()).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(promote).toContainText("Nothing is merged");

  // Asked first, and cancelling opens nothing.
  await button.click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText("Nothing is merged");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(seen.filter((s) => s.method === "POST" && s.url === "/pulls")).toHaveLength(0);

  await button.click();
  await page.locator("dialog[open]").getByRole("button", { name: "Open the pull request" }).click();
  await expect(promote.getByRole("link", { name: "#77" })).toHaveAttribute("href", `https://github.com/${REPO}/pull/77`);
  await expect(button).toBeDisabled();

  // What the stand-in GitHub was asked: the server's token, a branch off main, the numbers, a draft.
  expect(seen.every((s) => s.auth === "Bearer test-token")).toBe(true);
  const file = seen.find((s) => s.method === "PUT")!;
  expect(file.url).toBe("/contents/packages/server/src/promoted/sudoku.json");
  expect(JSON.parse(Buffer.from(file.body.content, "base64").toString())).toEqual({ clues: [41, 39, 37, 35, 33, 31, 29] });
  expect(seen.find((s) => s.method === "POST" && s.url === "/pulls")!.body).toMatchObject({ base: "main", draft: true });
  // The token is the server's: nothing the page can see carries it.
  expect(await page.content()).not.toContain("test-token");

  // It is still there after a reload (the server kept it), and the live numbers weren't touched.
  await page.reload();
  await page.getByRole("tab", { name: "Tuning", exact: true }).click();
  await page.getByLabel("Game", { exact: true }).selectOption({ label: "The daily sudoku" });
  await expect(promote.getByRole("link", { name: "#77" })).toBeVisible();

  const api = await request.newContext({ baseURL: BASE });
  await api.post("/moderation/tunables/sudoku/reset", { data: {}, headers: { authorization: `Bearer ${TOKEN}` } });
  await page.close();
});
