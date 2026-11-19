// "What's new": the front page's short list of what changed lately, taken from the pull requests
// merged into the parlor's repository. Their titles are already written for people ("Front page:
// favorites, and Jump back in"), so they're used as they are.
//
//   GET /news   { changes: [{ title, url, merged }] }, newest first
//
// GitHub is asked at most once an hour, whoever asks; between times, and when GitHub can't be
// reached, the last answer is given (or an empty list before there is one). The repository is
// public, so a token only lifts GitHub's limit on how often it may be asked.

/** How many changes the list holds. */
export const NEWS_SHOWN = 5;
/** How long GitHub's answer is kept. */
export const NEWS_KEPT_MS = 60 * 60_000;

export interface Change {
  title: string;
  url: string;
  /** When it was merged, as an ISO date and time. */
  merged: string;
}

/**
 * Pull requests that aren't news to a player: dependency bumps, and work on the parlor's tests and
 * tooling (a title that starts with "Bump", "chore", "ci", "test" or "deps", or a bot's).
 */
const NOT_NEWS = /^(bump|chore|ci|test|tests|deps|build)\b[:( ]/i;

interface PullRequest {
  title?: string;
  html_url?: string;
  merged_at?: string | null;
  user?: { type?: string } | null;
}

export function createNews({ repo, token, fetch: get = globalThis.fetch, now = Date.now }: { repo: string; token?: string; fetch?: typeof fetch; now?: () => number }) {
  let kept: { at: number; changes: Change[] } | null = null;
  let asking: Promise<Change[]> | null = null;

  async function ask(): Promise<Change[]> {
    const answer = await get(`https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=40`, {
      method: "GET",
      headers: { accept: "application/vnd.github+json", "user-agent": "open.parlor", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    if (!answer.ok) throw new Error(`GitHub said ${answer.status}`);
    const pulls = (await answer.json()) as PullRequest[];
    return pulls
      .filter((p) => p.merged_at && p.title && p.html_url && p.user?.type !== "Bot" && !NOT_NEWS.test(p.title))
      .sort((a, b) => Date.parse(b.merged_at!) - Date.parse(a.merged_at!))
      .slice(0, NEWS_SHOWN)
      .map((p) => ({ title: p.title!.trim().slice(0, 160), url: p.html_url!, merged: p.merged_at! }));
  }

  /** The changes, from GitHub if what's kept is old; one question at a time however many pages ask. */
  async function changes(): Promise<Change[]> {
    if (kept && now() - kept.at < NEWS_KEPT_MS) return kept.changes;
    asking ??= ask()
      .then((fresh) => {
        kept = { at: now(), changes: fresh };
        return fresh;
      })
      .catch(() => {
        // Ask again in a few minutes, not on every page: keep what there was meanwhile.
        kept = { at: now() - NEWS_KEPT_MS + 5 * 60_000, changes: kept?.changes ?? [] };
        return kept.changes;
      })
      .finally(() => (asking = null));
    return asking;
  }

  return {
    /** Answers GET /news; null for anything else. */
    async fetch(request: Request): Promise<Response | null> {
      if (new URL(request.url).pathname !== "/news") return null;
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
      return Response.json({ changes: await changes() }, { headers: { "cache-control": "public, max-age=300" } });
    },
  };
}
