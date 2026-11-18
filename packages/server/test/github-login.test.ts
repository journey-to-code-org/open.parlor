// Signing in to the admin app with GitHub: the web flow with no scopes, a list of who may, and a
// session of the parlor's own in place of GitHub's token. GitHub itself is faked here.
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";

const BASE = "https://parlor.test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
});

/** A GitHub that knows one code (for one login) and says what it was asked. */
function github(login = "Mnichols08") {
  const seen: { url: string; body?: unknown; auth?: string | null }[] = [];
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    seen.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: headers.get("authorization") });
    if (url === "https://github.com/login/oauth/access_token") {
      const body = JSON.parse(String(init!.body));
      return Response.json(body.code === "good-code" && body.client_secret === "shh" ? { access_token: "gho_theirs" } : { error: "bad_verification_code" });
    }
    if (url === "https://api.github.com/user") return headers.get("authorization") === "Bearer gho_theirs" ? Response.json({ login }) : new Response("no", { status: 401 });
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  return { fake, seen };
}

function setup({ login = "Mnichols08", allow = ["mnichols08"], token, now = () => Date.now(), client = true }: { login?: string; allow?: string[]; token?: string; now?: () => number; client?: boolean } = {}) {
  const gh = github(login);
  const app = createCardRoom({
    log: memoryLog({ keep: "latest" }),
    botDelay: 1,
    talk: false,
    adminToken: token,
    github: client ? { clientId: "client-1", clientSecret: "shh", allow, fetch: gh.fake, now } : undefined,
  });
  open.push(app);
  const get = async (path: string, headers: Record<string, string> = {}) => (await app.fetch(new Request(BASE + path, { headers })))!;
  const admin = async (path: string, bearer?: string) => {
    const r = (await app.fetch(new Request(`${BASE}/moderation${path}`, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} })))!;
    return { status: r.status, body: (await r.json()) as any };
  };
  /** Start at /login, and come back from GitHub with `code`, carrying the state and the cookie as a browser would. */
  async function signIn(code = "good-code", tamper?: (state: string) => string) {
    const login = await get("/moderation/github/login");
    const to = new URL(login.headers.get("location")!);
    const state = to.searchParams.get("state")!;
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const back = await get(`/moderation/github/callback?code=${code}&state=${encodeURIComponent(tamper ? tamper(state) : state)}`, { cookie });
    const where = new URL(back.headers.get("location")!);
    return { login, to, back, where, fragment: new URLSearchParams(where.hash.slice(1)) };
  }
  return { app, get, admin, signIn, gh };
}

describe("whether it is on", () => {
  it("is off without an OAuth app and a list of logins, and says so", async () => {
    const { get } = setup({ client: false });
    expect(await (await get("/moderation/github/status")).json()).toEqual({ enabled: false });
    expect((await get("/moderation/github/login")).status).toBe(503);
    const noList = setup({ allow: [] });
    expect(await (await noList.get("/moderation/github/status")).json()).toEqual({ enabled: false });
  });

  it("is on with both, and anyone may ask", async () => {
    const { get } = setup();
    expect(await (await get("/moderation/github/status")).json()).toEqual({ enabled: true });
  });

  it("turns the admin app on by itself, with no admin token", async () => {
    const { admin } = setup();
    expect((await admin("/overview")).status).toBe(401);
    const off = setup({ client: false });
    expect((await off.admin("/overview")).status).toBe(503);
  });
});

describe("the way out to GitHub", () => {
  it("sends the browser to GitHub's page for the app, with no scope and a state that is kept in a cookie", async () => {
    const { signIn } = setup();
    const { login, to } = await signIn();
    expect(login.status).toBe(302);
    expect(`${to.origin}${to.pathname}`).toBe("https://github.com/login/oauth/authorize");
    expect(Object.fromEntries(to.searchParams)).toMatchObject({ client_id: "client-1", redirect_uri: `${BASE}/moderation/github/callback`, allow_signup: "false" });
    expect(to.searchParams.has("scope")).toBe(false);
    const cookie = login.headers.get("set-cookie")!;
    expect(cookie).toContain(`parlor_github_state=${to.searchParams.get("state")}`);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toContain("Path=/moderation/github");
  });

  it("gives each start its own state", async () => {
    const { signIn } = setup();
    expect((await signIn()).to.searchParams.get("state")).not.toBe((await signIn()).to.searchParams.get("state"));
  });

  it("goes back to the address a proxy says the parlor has", async () => {
    const { app } = setup();
    const r = (await app.fetch(new Request("http://10.0.0.4:8787/moderation/github/login", { headers: { "x-forwarded-host": "cards.example", "x-forwarded-proto": "https" } })))!;
    expect(new URL(r.headers.get("location")!).searchParams.get("redirect_uri")).toBe("https://cards.example/moderation/github/callback");
  });
});

describe("the way back", () => {
  it("lets in someone on the list, whatever the case, with a session for the admin app", async () => {
    const { signIn, admin, gh } = setup();
    const { back, where, fragment } = await signIn();
    expect(back.status).toBe(302);
    expect(`${where.origin}${where.pathname}`).toBe(`${BASE}/admin/sign-in`);
    const session = fragment.get("session")!;
    expect(session).toMatch(/^v1\.Mnichols08\.\d+\./);
    expect(back.headers.get("set-cookie")).toContain("Max-Age=0");
    // It opens what the admin token opens.
    expect((await admin("/overview", session)).status).toBe(200);
    // GitHub's own token is used for the one question and never handed on.
    expect(gh.seen.map((s) => s.url)).toEqual(["https://github.com/login/oauth/access_token", "https://api.github.com/user"]);
    expect(where.href).not.toContain("gho_theirs");
    expect(session).not.toContain("gho_theirs");
    expect(gh.seen[0]!.body).toMatchObject({ client_id: "client-1", code: "good-code", redirect_uri: `${BASE}/moderation/github/callback` });
  });

  it("turns away a real GitHub account that is not on the list, and names it", async () => {
    const { signIn, admin } = setup({ login: "someone-else" });
    const { fragment } = await signIn();
    expect(fragment.get("session")).toBeNull();
    expect(fragment.get("error")).toBe("someone-else isn't on this parlor's list of admins.");
    expect((await admin("/overview", "v1.someone-else.9999999999999.x")).status).toBe(401);
  });

  it("refuses a state that isn't the one it kept (someone else's link, or none)", async () => {
    const { signIn, get } = setup();
    expect((await signIn("good-code", (s) => `${s.slice(0, -1)}${s.endsWith("a") ? "b" : "a"}`)).fragment.get("error")).toMatch(/didn't start here/);
    const none = await get("/moderation/github/callback?code=good-code&state=abc");
    expect(new URLSearchParams(new URL(none.headers.get("location")!).hash.slice(1)).get("error")).toMatch(/didn't start here/);
  });

  it("says so when GitHub says no", async () => {
    const { signIn } = setup();
    expect((await signIn("a-wrong-code")).fragment.get("error")).toMatch(/wouldn't sign you in/);
    const { get } = setup();
    const login = await get("/moderation/github/login");
    const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
    const denied = await get(`/moderation/github/callback?error=access_denied&state=${state}`, { cookie: login.headers.get("set-cookie")!.split(";")[0]! });
    expect(new URLSearchParams(new URL(denied.headers.get("location")!).hash.slice(1)).get("error")).toBe("GitHub didn't sign you in.");
  });

  it("says so when GitHub can't be reached", async () => {
    const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 1, talk: false, github: { clientId: "c", clientSecret: "shh", allow: ["me"], fetch: (async () => { throw new Error("offline"); }) as typeof fetch } });
    open.push(app);
    const login = (await app.fetch(new Request(`${BASE}/moderation/github/login`)))!;
    const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
    const back = (await app.fetch(new Request(`${BASE}/moderation/github/callback?code=x&state=${state}`, { headers: { cookie: login.headers.get("set-cookie")!.split(";")[0]! } })))!;
    expect(new URLSearchParams(new URL(back.headers.get("location")!).hash.slice(1)).get("error")).toBe("Couldn't reach GitHub. Try again.");
  });
});

describe("a session", () => {
  it("ends after its hours", async () => {
    let clock = Date.parse("2026-11-18T12:00:00Z");
    const { signIn, admin } = setup({ now: () => clock });
    const session = (await signIn()).fragment.get("session")!;
    clock += 11 * 3_600_000;
    expect((await admin("/overview", session)).status).toBe(200);
    clock += 2 * 3_600_000;
    expect((await admin("/overview", session)).status).toBe(401);
  });

  it("can't be made up, changed, or moved to another login", async () => {
    const { signIn, admin } = setup();
    const session = (await signIn()).fragment.get("session")!;
    const [v, login, expires, signature] = session.split(".") as [string, string, string, string];
    for (const forged of [`${v}.${login}.${Number(expires) + 10_000_000}.${signature}`, `${v}.other.${expires}.${signature}`, `${v}.${login}.${expires}.${signature.slice(0, -2)}xx`, `${v}.${login}.${expires}.`, "v1", "v2.a.b.c"]) expect((await admin("/overview", forged)).status).toBe(401);
  });

  it("stops working when its person is taken off the list, or the OAuth app's secret changes", async () => {
    const first = setup();
    const session = (await first.signIn()).fragment.get("session")!;
    // The same app and secret, with no one on the list but someone else.
    const other = setup({ allow: ["someone-else"] });
    expect((await other.admin("/overview", session)).status).toBe(401);
    const other2 = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 1, talk: false, github: { clientId: "client-1", clientSecret: "a-new-secret", allow: ["mnichols08"] } });
    open.push(other2);
    expect((await (await other2.fetch(new Request(`${BASE}/moderation/overview`, { headers: { authorization: `Bearer ${session}` } })))!.status)).toBe(401);
  });

  it("is signed with CARDROOM_SESSION_SECRET if there is one, so the OAuth secret can change without ending it", async () => {
    const make = (clientSecret: string) => createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 1, talk: false, github: { clientId: "c", clientSecret, allow: ["me"], signingKey: "steady", fetch: github("me").fake } });
    const a = make("shh");
    const b = make("shh2");
    open.push(a, b);
    const login = (await a.fetch(new Request(`${BASE}/moderation/github/login`)))!;
    const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
    const back = (await a.fetch(new Request(`${BASE}/moderation/github/callback?code=good-code&state=${state}`, { headers: { cookie: login.headers.get("set-cookie")!.split(";")[0]! } })))!;
    const session = new URLSearchParams(new URL(back.headers.get("location")!).hash.slice(1)).get("session")!;
    expect(session).toMatch(/^v1\.me\./);
    expect((await (await b.fetch(new Request(`${BASE}/moderation/overview`, { headers: { authorization: `Bearer ${session}` } })))!.status)).toBe(200);
  });

  it("doesn't change what the admin token does, and a wrong one is still wrong", async () => {
    const { admin, signIn } = setup({ token: "let-me-in" });
    expect((await admin("/overview", "let-me-in")).status).toBe(200);
    expect((await admin("/overview", "nope")).status).toBe(401);
    expect((await admin("/overview", (await signIn()).fragment.get("session")!)).status).toBe(200);
  });
});
