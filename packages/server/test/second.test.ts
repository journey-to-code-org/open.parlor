// Two people at one device, at a table on the server: the second has a seat, a view and moves of
// their own, reached at /second/<n>/… with the device's own cookie.
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { SECONDS, secondCookie, secondOf, secondPath, secondSearch } from "../src/second.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((a) => a.close());
  open = [];
});

function setup() {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 5, talk: false });
  open.push(app);
  const device = () => {
    let cookie = "";
    return async (path: string, body?: unknown) => {
      const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      return { status: r.status, body: (await r.json()) as any, cookie };
    };
  };
  return { app, device };
}

describe("a second person at a device", () => {
  it("is a player of their own, worked out from the device's, the same every time", () => {
    expect(secondOf("abc", 1)).toBe(secondOf("abc", 1));
    expect(secondOf("abc", 1)).not.toBe(secondOf("abc", 2));
    expect(secondOf("abc", 1)).not.toBe(secondOf("abd", 1));
    expect(secondOf("abc", 1)).toMatch(/^[a-z0-9]{32}$/);
    expect(secondPath("/second/2/rooms/x7/act")).toEqual({ n: 2, path: "/rooms/x7/act" });
    expect(secondPath("/rooms/x7/act")).toBeNull();
    expect(secondPath("/seconds/1/rooms")).toBeNull();
    // The second person's live stream is a stream of its own, though the same tab opens it.
    expect(secondSearch("?since=4&peer=k3j2h1g0&key=abc", 1)).toBe("?since=4&peer=k3j2h1g0-1&key=abc");
    expect(secondSearch("?since=4", 1)).toBe("?since=4");
    expect(secondSearch("", 2)).toBe("");
    // The rest of a browser's cookies are left as they were.
    expect(secondCookie("theme=dark; rooms_player=abc", 1)).toEqual({ cookie: `theme=dark; rooms_player=${secondOf("abc", 1)}`, setCookie: null });
    // A browser that is nobody yet is made somebody, so the second person is the same next time.
    const fresh = secondCookie("", 1);
    expect(fresh.setCookie).toMatch(/^rooms_player=[a-z0-9]+;/);
    expect(fresh.cookie).toBe(`rooms_player=${secondOf(fresh.setCookie!.split(";")[0]!.split("=")[1]!, 1)}`);
  });

  it("takes a seat beside the first, and each plays their own turns from the one device", async () => {
    const { device } = setup();
    const phone = device();
    const tablet = device();
    // Everyone putts at once here, each at their own ball.
    const made = await phone("/rooms", { options: { game: "minigolf", rules: { id: "minigolf-quick-together" }, seats: 3 } });
    const id = made.body.id as string;
    expect((await phone(`/rooms/${id}/sit`, { seat: 0, name: "Mikey" })).body).toEqual({ seat: 0 });
    // The second person at the phone sits in the next seat; the phone's own seat is still its own.
    expect((await phone(`/second/1/rooms/${id}/sit`, { seat: 1, name: "Grammi" })).body).toEqual({ seat: 1 });
    expect((await phone(`/rooms/${id}`)).body.seat).toBe(0);
    expect((await phone(`/second/1/rooms/${id}`)).body.seat).toBe(1);
    // Someone on a device of their own takes the third.
    expect((await tablet(`/rooms/${id}/sit`, { seat: 2, name: "Rick" })).body).toEqual({ seat: 2 });
    expect((await tablet(`/rooms/${id}`)).body.seats.map((s: { name: string }) => s.name)).toEqual(["Mikey", "Grammi", "Rick"]);
    // The tablet has no second person there, and can't be the phone's.
    expect((await tablet(`/second/1/rooms/${id}`)).body.seat).toBeNull();
    expect((await phone(`/rooms/${id}/start`, {})).status).toBe(200);

    const putt = (ball: number) => ({ move: { type: "shot", body: `ball-${ball}`, angle: 27000, power: 300 } });
    // The phone's own player putts its own ball, and can't putt the ball of the person beside it.
    expect((await phone(`/rooms/${id}/act`, putt(1))).status).toBeGreaterThanOrEqual(400);
    expect((await phone(`/rooms/${id}/act`, putt(0))).status).toBe(200);
    // The second person putts theirs, from the same phone, and nobody else's.
    expect((await phone(`/second/1/rooms/${id}/act`, putt(2))).status).toBeGreaterThanOrEqual(400);
    expect((await phone(`/second/1/rooms/${id}/act`, putt(1))).status).toBe(200);
    expect((await tablet(`/rooms/${id}/act`, putt(2))).status).toBe(200);
  });

  it("can give the seat back before the game starts", async () => {
    const { device } = setup();
    const phone = device();
    const id = (await phone("/rooms", { options: { game: "bowling", rules: { id: "bowling-five" }, seats: 2 } })).body.id as string;
    await phone(`/rooms/${id}/sit`, { seat: 0, name: "Mikey" });
    await phone(`/second/1/rooms/${id}/sit`, { seat: 1, name: "Grammi" });
    expect((await phone(`/second/1/rooms/${id}/stand`, {})).status).toBe(200);
    expect((await phone(`/rooms/${id}`)).body.seats.map((s: { name: string | null }) => s.name)).toEqual(["Mikey", null]);
    expect((await phone(`/rooms/${id}`)).body.seat).toBe(0);
  });

  it("gives a browser that had no cookie its own, never the second person's", async () => {
    const { device } = setup();
    const phone = device();
    const other = device();
    const id = (await other("/rooms", { options: { game: "chess", seats: 2 } })).body.id as string;
    // The second person sits before the phone's own player ever has.
    const sat = await phone(`/second/1/rooms/${id}/sit`, { seat: 1, name: "Grammi" });
    expect(sat.body).toEqual({ seat: 1 });
    const own = sat.cookie.split("=")[1]!;
    // The phone is now somebody, with no seat here; its second person has seat 1.
    expect((await phone(`/rooms/${id}`)).body.seat).toBeNull();
    expect((await phone(`/second/1/rooms/${id}`)).body.seat).toBe(1);
    expect(own).not.toBe(secondOf(own, 1));
  });

  it("reaches tables and nothing else, for no more people than a device may seat", async () => {
    const { device } = setup();
    const phone = device();
    expect((await phone("/second/1/houses", { name: "Ours" })).status).toBe(404);
    expect((await phone("/second/1/designs")).status).toBe(404);
    expect((await phone(`/second/${SECONDS + 1}/rooms`, { options: { game: "chess", seats: 2 } })).status).toBe(404);
    expect((await phone(`/second/${SECONDS}/rooms`, { options: { game: "chess", seats: 2 } })).status).toBe(201);
  });
});
