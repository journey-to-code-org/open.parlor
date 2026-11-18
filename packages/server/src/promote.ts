// Promoting a game's saved numbers into the code: a draft pull request, never a push to the main branch.
//
// What the host saves on the Tuning page is a live override (see tunables.ts). Promoting writes it into the
// repository, into the game's promoted file (TUNABLE_GAMES[game].promoted, which the game lays under its
// live override), on a new branch, and opens a draft pull request for CI and review. Merging it is a
// person's choice, made on GitHub.
//
// The token is a fine-grained one for the one repository (contents and pull requests, write). It lives in
// the server's settings and nowhere else: the browser never sees it and the log never carries it. Which
// file is written comes from the server's own table, never from the request, and only the games' own
// saved (already checked) numbers go into it.
import { check, TUNABLE_GAMES, type Saved } from "./tunables.js";

export interface PromoteOptions {
  /** A fine-grained GitHub token for `repo`. Without it, promoting is off. */
  token?: string;
  /** "owner/name". */
  repo?: string;
  /** The branch the pull request is for. */
  base?: string;
  /** GitHub's API address; only a test points it elsewhere (a stand-in GitHub). */
  api?: string;
  /** For tests: the fetch, and the clock. */
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

export interface Promotion {
  version: number;
  url: string;
  number: number;
  branch: string;
  at: number;
}

interface Sync {
  write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown>;
  documents(): Promise<{ get(collection: string, key: string): Record<string, unknown> | undefined }>;
}

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** `over` laid over `under`: objects merge key by key; anything else (numbers, lists) is replaced. */
export function merge(under: unknown, over: unknown): unknown {
  if (!isPlain(under) || !isPlain(over)) return over;
  const out: Record<string, unknown> = { ...under };
  for (const [key, value] of Object.entries(over)) out[key] = key in under ? merge(under[key], value) : value;
  return out;
}

/** Stable key order, so a promoted file changes only where the numbers did. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (!isPlain(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]));
}

export class PromoteError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export function createPromote(sync: Sync, { token, repo = "journey-to-code-org/open.parlor", base = "main", api: root = "https://api.github.com", fetch = globalThis.fetch, now = () => Date.now() }: PromoteOptions = {}) {
  const docs = sync.documents();
  const enabled = Boolean(token) && /^[\w.-]+\/[\w.-]+$/.test(repo);

  async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
    let answer: Response;
    try {
      answer = await fetch(`${root.replace(/\/$/, "")}/repos/${repo}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "open-parlor", ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new PromoteError("Couldn't reach GitHub. Try again.");
    }
    return { status: answer.status, body: await answer.json().catch(() => ({})) };
  }

  /** Says what GitHub refused, in words (never anything of the token). */
  function refused(step: string, got: { status: number; body: any }): PromoteError {
    if (got.status === 401) return new PromoteError("GitHub doesn't accept the parlor's token. It may have expired.");
    if (got.status === 403 || got.status === 404) return new PromoteError(`GitHub wouldn't let the parlor ${step}. Check the token's repository and its contents and pull request permissions.`);
    return new PromoteError(`GitHub wouldn't ${step} (${got.status}${typeof got.body?.message === "string" ? `: ${got.body.message}` : ""}).`);
  }

  async function last(game: string): Promise<Promotion | undefined> {
    const raw = (await docs).get("settings", "promoted")?.[game] as Partial<Promotion> | undefined;
    return raw && typeof raw.version === "number" && typeof raw.url === "string" ? (raw as Promotion) : undefined;
  }

  return {
    enabled,
    repo,
    base,
    last,
    /** Opens the draft pull request for `game`'s saved numbers. Rejects with a PromoteError that is fit to show. */
    async open(game: string, saved: Saved): Promise<Promotion> {
      const spec = TUNABLE_GAMES[game];
      if (!spec) throw new PromoteError("That game has nothing to tune.", 404);
      if (!enabled) throw new PromoteError("Opening pull requests isn't set up on this parlor.", 503);
      if (Object.keys(saved.values).length === 0) throw new PromoteError("There's nothing saved to promote.", 409);
      const problems = check(spec.shape, saved.values);
      if (problems.length) throw new PromoteError(problems[0]!, 422);
      const done = await last(game);
      if (done?.version === saved.version) throw new PromoteError(`Version ${saved.version} already has a pull request: ${done.url}`, 409);

      const head = await api("GET", `/git/ref/heads/${encodeURIComponent(base)}`);
      if (head.status !== 200 || typeof head.body?.object?.sha !== "string") throw refused(`read the ${base} branch`, head);
      const file = await api("GET", `/contents/${spec.promoted}?ref=${encodeURIComponent(base)}`);
      let current: unknown = {};
      if (file.status === 200 && typeof file.body?.content === "string") {
        try {
          current = JSON.parse(Buffer.from(file.body.content, "base64").toString("utf8"));
        } catch {
          throw new PromoteError(`${spec.promoted} on ${base} isn't valid JSON, so it can't be added to.`, 409);
        }
      } else if (file.status !== 404) throw refused("read the promoted numbers", file);

      const text = `${JSON.stringify(sorted(merge(current, saved.values)), null, 2)}\n`;
      const branch = `tuning/${game}-v${saved.version}-${now().toString(36)}`;
      const made = await api("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: head.body.object.sha });
      if (made.status !== 201) throw refused("make a branch", made);
      const drop = () => api("DELETE", `/git/refs/heads/${branch}`).catch(() => undefined);
      try {
        const put = await api("PUT", `/contents/${spec.promoted}`, {
          message: `Tune ${spec.name}: promote numbers from the admin app (version ${saved.version})`,
          content: Buffer.from(text).toString("base64"),
          branch,
          ...(file.status === 200 && typeof file.body?.sha === "string" ? { sha: file.body.sha } : {}),
        });
        if (put.status !== 200 && put.status !== 201) throw refused("commit the numbers", put);
        const pr = await api("POST", "/pulls", {
          title: `Tune ${spec.name} (admin version ${saved.version})`,
          head: branch,
          base,
          draft: true,
          body: [
            `The numbers saved for ${spec.name} on the parlor's Tuning page (version ${saved.version}), written into \`${spec.promoted}\`.`,
            "",
            "Opened by the admin app as a draft. CI runs on it like any change; merge it when it looks right.",
            "",
            "After it is merged and deployed, put the game's numbers back on the Tuning page: the saved override is then the same as the code, and resetting it leaves nothing to drift.",
          ].join("\n"),
        });
        if (pr.status !== 201 || typeof pr.body?.html_url !== "string") throw refused("open the pull request", pr);
        const promotion: Promotion = { version: saved.version, url: pr.body.html_url, number: Number(pr.body.number) || 0, branch, at: now() };
        await sync.write("settings", "promoted", { [game]: promotion });
        return promotion;
      } catch (error) {
        await drop();
        throw error;
      }
    },
  };
}

export type Promote = ReturnType<typeof createPromote>;
