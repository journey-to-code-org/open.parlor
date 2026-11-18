import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import conformance from "./playwright.config";

// The page the parlor's own server draws (/games: packages/server/src/pages.ts), used in a browser
// with JavaScript off and on. It needs the server and the web app built (`npm run build` at the
// repository's root), which the conformance pages don't, so it has a config and a script of its
// own: `npm run server-page`. Same three browsers.
//
// The token isn't real. It is there so the page has its "Ask for a game" form; the tests only ask
// for games the parlor already has, which never reaches GitHub.
export default defineConfig({
  testDir: "server-tests",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [...(process.env.CI ? ([["github"]] as const) : []), ["list"]],
  use: { baseURL: "http://localhost:4180" },
  projects: conformance.projects,
  webServer: {
    command: "node ../server/dist/index.js",
    env: { NODE_ENV: "production", PORT: "4180", SPADES_DB: join(tmpdir(), `parlor-server-page-${process.pid}.db`), CARDROOM_GITHUB_TOKEN: "not-a-real-token", CARDROOM_ADMIN_TOKEN: "let-the-host-in", CARDROOM_GITHUB_CLIENT_ID: "test-client", CARDROOM_GITHUB_CLIENT_SECRET: "test-secret", CARDROOM_ADMIN_GITHUB: "test-admin" },
    url: "http://localhost:4180/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
