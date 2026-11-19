// A table's chat, between two people at a real table: what one says reaches the other live, as a line
// in the chat and a bubble by the seat, and someone watching reads along without a box to talk in.
// The chat is the parlor's (open.chat); the page keeps one connection to it, beside the table's own.
import { expect, test, type Browser, type Page } from "@playwright/test";

/** Someone in a browser of their own, at the table in a seat (or watching, with none). */
async function at(browser: Browser, id: string, seat: number | null, name: string) {
  const context = await browser.newContext({ baseURL: "http://localhost:4180" });
  if (seat !== null) expect((await context.request.post(`/rooms/${id}/sit`, { data: { seat, name } })).ok()).toBe(true);
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("response", (r) => r.url().includes("/_zb/") && r.status() >= 400 && problems.push(`${r.status()} ${new URL(r.url()).pathname}`));
  await page.goto(`/?table=${id}`);
  return { page, problems, close: () => context.close() };
}

const say = async (page: Page, text: string) => {
  await page.getByRole("button", { name: /^Chat/ }).click();
  const sheet = page.getByRole("dialog", { name: "Table chat" });
  await sheet.getByRole("textbox", { name: "Message" }).fill(text);
  await sheet.getByRole("textbox", { name: "Message" }).press("Enter");
  return sheet;
};

test("said at a table, heard live by the others, and read along by someone watching", async ({ browser, request }) => {
  const tag = Math.random().toString(36).slice(2, 6);
  const { id } = await (await request.post("http://localhost:4180/rooms", { data: { options: {} } })).json();
  const ann = await at(browser, id, 0, `Ann${tag}`);
  const bo = await at(browser, id, 1, `Bo${tag}`);
  const cy = await at(browser, id, null, "");
  for (const p of [ann, bo]) await expect(p.page.getByRole("button", { name: /^Chat/ })).toBeVisible();

  const sheet = await say(ann.page, `Pull up a chair ${tag}`);
  await expect(sheet).toContainText(`Pull up a chair ${tag}`);
  // Bo hears it without asking: a line waiting in the chat.
  await expect(bo.page.getByRole("button", { name: "Chat, 1 new" })).toBeVisible();
  const answered = await say(bo.page, `On my way ${tag}`);
  await expect(answered).toContainText(`Pull up a chair ${tag}`);
  await expect(answered).toContainText(`On my way ${tag}`);
  // Ann has the chat open: Bo's answer appears in it.
  await expect(sheet).toContainText(`On my way ${tag}`);
  // Cy, watching, reads along; nothing they could type would be taken.
  await expect(cy.page.getByRole("button", { name: "Chat, 2 new" })).toBeVisible();
  expect((await cy.page.request.post(`/rooms/${id}/chat`, { data: { text: "Hi" } })).status()).toBe(403);

  // Taken down by the host: gone for everyone at the table.
  const host = request;
  const chat = (await (await host.get(`http://localhost:4180/moderation/tables/${id}`, { headers: { authorization: "Bearer let-the-host-in" } })).json()).chat as { id: number; text: string }[];
  expect(chat.map((m) => m.text)).toEqual([`Pull up a chair ${tag}`, `On my way ${tag}`]);
  expect((await host.post(`http://localhost:4180/moderation/tables/${id}/redact`, { headers: { authorization: "Bearer let-the-host-in" }, data: { id: chat[0]!.id } })).ok()).toBe(true);
  await expect(answered).not.toContainText(`Pull up a chair ${tag}`);
  await expect(answered).toContainText(`On my way ${tag}`);

  // Nothing about the chat was turned away along the way: the page's connections each kept to their own server.
  expect([...ann.problems, ...bo.problems, ...cy.problems]).toEqual([]);
  await Promise.all([ann.close(), bo.close(), cy.close()]);
});

test("once dealt: a bubble by the seat that spoke, and the computer players talk in the same chat", async ({ browser, request }) => {
  const tag = Math.random().toString(36).slice(2, 6);
  const { id } = await (await request.post("http://localhost:4180/rooms", { data: { options: {} } })).json();
  const ann = await at(browser, id, 0, `Ann${tag}`);
  const bo = await at(browser, id, 1, `Bo${tag}`);
  await ann.page.request.post(`/rooms/${id}/bot`, { data: { seat: 2, name: "Dot" } });
  await ann.page.request.post(`/rooms/${id}/bot`, { data: { seat: 3, name: "Lou" } });
  expect((await ann.page.request.post(`/rooms/${id}/start`, { data: {} })).ok()).toBe(true);

  await say(ann.page, `Good luck ${tag}`);
  await expect(bo.page.getByRole("status", { name: `Ann${tag} says Good luck ${tag}` })).toBeVisible();
  // The computer players greet the table and answer: their words come the same way, as theirs.
  await bo.page.getByRole("button", { name: /^Chat/ }).click();
  const sheet = bo.page.getByRole("dialog", { name: "Table chat" });
  await expect(sheet).toContainText(`Good luck ${tag}`);
  await expect.poll(async () => ((await (await request.get(`http://localhost:4180/moderation/tables/${id}`, { headers: { authorization: "Bearer let-the-host-in" } })).json()).chat as { bot: boolean }[]).some((m) => m.bot), { timeout: 10_000 }).toBe(true);

  expect([...ann.problems, ...bo.problems]).toEqual([]);
  await Promise.all([ann.close(), bo.close()]);
});
