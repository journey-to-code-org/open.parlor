// "What's new": the pull requests merged lately, as the front page shows them.
import { describe, expect, it } from "vitest";
import { createNews, NEWS_KEPT_MS, NEWS_SHOWN } from "../src/news.js";

const pr = (n: number, title: string, merged: string | null, bot = false) => ({ title, html_url: `https://github.com/o/r/pull/${n}`, merged_at: merged, user: { type: bot ? "Bot" : "User" } });

function github(pulls: unknown[], status = 200) {
  const asked: { url: string; auth?: string }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    asked.push({ url, auth: (init.headers as Record<string, string>).authorization });
    return status === 200 ? Response.json(pulls) : new Response("nope", { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, asked };
}
const read = async (news: ReturnType<typeof createNews>) => (await (await news.fetch(new Request("https://cards.test/news")))!.json()) as { changes: { title: string; url: string; merged: string }[] };

describe("what's new", () => {
  it("lists the merged pull requests, newest first, and leaves out what isn't news to a player", async () => {
    const { fetch } = github([
      pr(1, "Front page: favorites", "2026-11-18T10:00:00Z"),
      pr(2, "Closed without merging", null),
      pr(3, "Bump vite from 8.3 to 8.4", "2026-11-18T11:00:00Z", true),
      pr(4, "chore: tidy the scripts", "2026-11-18T12:00:00Z"),
      pr(5, "Klondike on a phone: the stock can be tapped", "2026-11-18T13:00:00Z"),
      pr(6, "test: every game on a phone", "2026-11-18T09:00:00Z"),
    ]);
    const { changes } = await read(createNews({ repo: "o/r", fetch }));
    expect(changes.map((c) => c.title)).toEqual(["Klondike on a phone: the stock can be tapped", "Front page: favorites"]);
    expect(changes[0]).toEqual({ title: "Klondike on a phone: the stock can be tapped", url: "https://github.com/o/r/pull/5", merged: "2026-11-18T13:00:00Z" });
  });

  it("shows only the latest few", async () => {
    const { fetch } = github(Array.from({ length: 12 }, (_, i) => pr(i, `Change ${i}`, `2026-11-${String(i + 1).padStart(2, "0")}T10:00:00Z`)));
    const { changes } = await read(createNews({ repo: "o/r", fetch }));
    expect(changes).toHaveLength(NEWS_SHOWN);
    expect(changes[0]!.title).toBe("Change 11");
  });

  it("asks GitHub once an hour, with the token when there is one", async () => {
    let at = 0;
    const { fetch, asked } = github([pr(1, "A change", "2026-11-18T10:00:00Z")]);
    const news = createNews({ repo: "o/r", token: "ghp_x", fetch, now: () => at });
    await Promise.all([read(news), read(news), read(news)]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ url: expect.stringContaining("https://api.github.com/repos/o/r/pulls?state=closed"), auth: "Bearer ghp_x" });
    at += NEWS_KEPT_MS + 1;
    await read(news);
    expect(asked).toHaveLength(2);
  });

  it("keeps what it had when GitHub can't be reached, and is empty before it has anything", async () => {
    let status = 200;
    let at = 0;
    const pulls = [pr(1, "A change", "2026-11-18T10:00:00Z")];
    const fetch = (async () => (status === 200 ? Response.json(pulls) : new Response("down", { status }))) as unknown as typeof globalThis.fetch;
    const news = createNews({ repo: "o/r", fetch, now: () => at });
    expect((await read(news)).changes).toHaveLength(1);
    status = 503;
    at += NEWS_KEPT_MS + 1;
    expect((await read(news)).changes).toHaveLength(1);
    const fresh = createNews({ repo: "o/r", fetch, now: () => at });
    expect((await read(fresh)).changes).toEqual([]);
  });
});
