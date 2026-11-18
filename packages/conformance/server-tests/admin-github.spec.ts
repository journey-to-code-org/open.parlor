// Signing in to the admin app with GitHub, as far as a browser can without GitHub: the button is there
// when the server has an OAuth app, it starts the trip to GitHub, and what comes back in the address's
// fragment (a session, or a reason) is taken in and removed from the address. The trip itself, and the
// check of who is let in, are tested on the server with GitHub faked (packages/server/test/github-login.test.ts).
import { createHmac } from "node:crypto";
import { expect, request, test } from "@playwright/test";

const BASE = "http://localhost:4180";
/** What the server would hand back for a login, signed as it signs (the OAuth app's secret is the test server's). */
function session(login: string, expires = Date.now() + 3_600_000, secret = "test-secret") {
  const payload = `v1.${login}.${expires}`;
  return `${payload}.${createHmac("sha256", `cardroom-admin-session:${secret}`).update(payload).digest("base64url")}`;
}

test("the door offers GitHub, and the button starts the trip there", async ({ page }) => {
  await page.goto("/admin/");
  const button = page.getByTestId("github-sign-in");
  await expect(button).toBeVisible();
  await expect(page.getByLabel("Admin token")).toBeVisible();
  // Followed by hand: GitHub itself is not reached.
  const api = await request.newContext({ baseURL: BASE });
  const login = await api.get("/moderation/github/login", { maxRedirects: 0 });
  expect(login.status()).toBe(302);
  const to = new URL(login.headers().location!);
  expect(to.origin + to.pathname).toBe("https://github.com/login/oauth/authorize");
  expect(to.searchParams.get("client_id")).toBe("test-client");
  expect(to.searchParams.get("redirect_uri")).toBe(`${BASE}/moderation/github/callback`);
  expect(await button.getAttribute("href")).toBe("../moderation/github/login");
});

test("what comes back from GitHub: a session lets in, and the address is cleaned", async ({ page }) => {
  await page.goto(`/admin/sign-in#session=${session("test-admin")}`);
  await expect(page.getByText("Playing now")).toBeVisible();
  expect(page.url()).not.toContain("session");
  // It is kept for the tab like the token is.
  await page.reload();
  await expect(page.getByText("Playing now")).toBeVisible();
});

test("a reason from the server is shown, and a session that isn't good is turned away", async ({ page }) => {
  await page.goto(`/admin/sign-in#error=${encodeURIComponent("someone isn't on this parlor's list of admins.")}`);
  await expect(page.getByText("someone isn't on this parlor's list of admins.")).toBeVisible();
  expect(page.url()).not.toContain("error");
  await page.goto(`/admin/sign-in#session=${session("test-admin", Date.now() - 1000)}`);
  await expect(page.getByRole("alert").or(page.getByText(/admin token/i)).first()).toBeVisible();
  await expect(page.getByLabel("Admin token")).toBeVisible();
  await page.goto(`/admin/sign-in#session=${session("not-listed")}`);
  await expect(page.getByLabel("Admin token")).toBeVisible();
  await expect(page.getByText("Playing now")).toHaveCount(0);
});
