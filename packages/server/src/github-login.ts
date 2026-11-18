// Signing in to the admin app with GitHub, instead of (or beside) the admin token.
//
// It is GitHub's web flow with no scopes: the parlor only asks who you are. The person's GitHub login
// must be on the host's list (CARDROOM_ADMIN_GITHUB); anyone else is turned away, however real their
// GitHub account. GitHub's own token is used once, to ask for the login, and thrown away. What the
// admin app is given is a session token of this parlor's own: the login, an expiry and a signature,
// good for the same /moderation requests the admin token is. Nothing is stored on the server, so a
// restart signs nobody out (the signing key comes from the app's secret), and changing the secret or
// taking someone off the list ends their sessions at once.
//
//   GET /moderation/github/status    { enabled } so the admin app knows whether to show the button
//   GET /moderation/github/login     to GitHub, with a state kept in a cookie for the way back
//   GET /moderation/github/callback  from GitHub: checks the state and the list, then to /admin/ with
//                                    the session token in the address's fragment (which no server logs)
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface GithubLoginOptions {
  /** The OAuth app's id and secret. Without both, signing in with GitHub is off. */
  clientId?: string;
  clientSecret?: string;
  /** The GitHub logins that may sign in, any case. */
  allow?: readonly string[];
  /** Signs the session tokens; the OAuth app's secret if this isn't given. */
  signingKey?: string;
  /** How long a session lasts. */
  hours?: number;
  /** For tests: GitHub's two addresses, and the clock. */
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  /** Where the admin app is, and where the parlor says it is when a proxy hides it (see pages.ts publicOrigin). */
  origin?: (request: Request) => string;
}

const COOKIE = "parlor_github_state";
const MOUNT = "/moderation/github";
const b64 = (data: Buffer | string) => Buffer.from(data).toString("base64url");

const html = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function createGithubLogin({ clientId, clientSecret, allow = [], signingKey, hours = 12, fetch = globalThis.fetch, now = () => Date.now(), origin = (r) => new URL(r.url).origin }: GithubLoginOptions = {}) {
  const enabled = !!clientId && !!clientSecret && allow.length > 0;
  const people = new Set(allow.map((login) => login.trim().toLowerCase()).filter(Boolean));
  const key = Buffer.from(signingKey || `cardroom-admin-session:${clientSecret ?? ""}`);
  const sign = (payload: string) => createHmac("sha256", key).update(payload).digest("base64url");

  /** A session for a login: `login.expires.signature`. A login can't contain a dot, so the parts are never mixed up. */
  function issue(login: string): string {
    const payload = `v1.${login}.${now() + hours * 3_600_000}`;
    return `${payload}.${sign(payload)}`;
  }

  /** The login a session token belongs to, if it is ours, not out of date and its person is still on the list. */
  function valid(token: string): string | null {
    if (!enabled) return null;
    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") return null;
    const [, login, expires, signature] = parts as [string, string, string, string];
    const expected = sign(`v1.${login}.${expires}`);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    if (!(Number(expires) > now()) || !people.has(login.toLowerCase())) return null;
    return login;
  }

  const back = (request: Request, fragment: string, clear = false) => {
    const headers = new Headers({ location: `${origin(request)}/admin/sign-in#${fragment}`, "cache-control": "no-store" });
    if (clear) headers.append("set-cookie", `${COOKIE}=; Path=${MOUNT}; HttpOnly; SameSite=Lax; Max-Age=0`);
    return new Response(null, { status: 302, headers });
  };
  const sorry = (request: Request, why: string) => back(request, `error=${encodeURIComponent(why)}`, true);

  async function callback(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const asked = url.searchParams.get("state") ?? "";
    const kept = /(?:^|;\s*)parlor_github_state=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1] ?? "";
    if (!asked || asked.length !== kept.length || !timingSafeEqual(Buffer.from(asked), Buffer.from(kept))) return sorry(request, "That sign-in didn't start here. Try again.");
    if (url.searchParams.get("error")) return sorry(request, "GitHub didn't sign you in.");
    const code = url.searchParams.get("code");
    if (!code) return sorry(request, "GitHub didn't send a code. Try again.");
    try {
      const exchanged = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "user-agent": "open.parlor" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: `${origin(request)}${MOUNT}/callback` }),
      });
      const token = ((await exchanged.json().catch(() => null)) as { access_token?: unknown } | null)?.access_token;
      if (typeof token !== "string") return sorry(request, "GitHub wouldn't sign you in. Try again.");
      const who = await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "open.parlor" } });
      const login = ((await who.json().catch(() => null)) as { login?: unknown } | null)?.login;
      if (typeof login !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(login)) return sorry(request, "GitHub didn't say who you are.");
      if (!people.has(login.toLowerCase())) return sorry(request, `${login} isn't on this parlor's list of admins.`);
      return back(request, `session=${issue(login)}`, true);
    } catch {
      return sorry(request, "Couldn't reach GitHub. Try again.");
    }
  }

  return {
    enabled,
    valid,
    /** Answers /moderation/github/...; null for anything else. */
    async fetch(request: Request): Promise<Response | null> {
      const { pathname } = new URL(request.url);
      if (pathname !== MOUNT && !pathname.startsWith(`${MOUNT}/`)) return null;
      if (request.method !== "GET") return html(404, { error: "Not found" });
      const rest = pathname.slice(MOUNT.length);
      if (rest === "/status") return html(200, { enabled });
      if (!enabled) return html(503, { error: "Signing in with GitHub is off. Set CARDROOM_GITHUB_CLIENT_ID, CARDROOM_GITHUB_CLIENT_SECRET and CARDROOM_ADMIN_GITHUB to turn it on." });
      if (rest === "/login") {
        const state = randomBytes(18).toString("base64url");
        const secure = origin(request).startsWith("https:") ? "; Secure" : "";
        const to = new URL("https://github.com/login/oauth/authorize");
        to.search = new URLSearchParams({ client_id: clientId!, redirect_uri: `${origin(request)}${MOUNT}/callback`, state, allow_signup: "false" }).toString();
        return new Response(null, { status: 302, headers: { location: to.href, "set-cookie": `${COOKIE}=${state}; Path=${MOUNT}; HttpOnly; SameSite=Lax; Max-Age=600${secure}`, "cache-control": "no-store" } });
      }
      if (rest === "/callback") return callback(request);
      return html(404, { error: "Not found" });
    },
  };
}

export type GithubLogin = ReturnType<typeof createGithubLogin>;
