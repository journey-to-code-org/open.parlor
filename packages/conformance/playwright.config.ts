import { defineConfig } from "@playwright/test";

// The built pages (npm run build), served by Vite's preview, in three browser engines. Chrome is
// the one already on the machine (GitHub's runners have it).
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // results-reporter writes dist/results.json, which the page at the root of the build shows.
  reporter: [...(process.env.CI ? ([["github"]] as const) : []), ["list"], ["./tests/results-reporter.ts"]],
  use: { baseURL: "http://localhost:4179" },
  // `npm run conformance` runs chrome alone, with nothing to download. `conformance:engines` runs
  // all three; Firefox and WebKit are Playwright's own builds (`npx playwright install firefox webkit`).
  projects: [
    { name: "chrome", use: { channel: "chrome", launchOptions: { args: ["--no-sandbox"] } } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: { command: "npx vite preview", url: "http://localhost:4179/element/", reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
