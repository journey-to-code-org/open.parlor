// The same player on another device: a code from the one that has the cookie, used once on the new one.
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { CODE_MINUTES, createDevices, tidyCode, WRONG_TRIES } from "../src/devices.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((a) => a.close());
  open = [];
});

function parlor() {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 50, talk: false });
  open.push(app);
  return () => {
    let cookie = "";
    const ask = async (path: string, body?: unknown) => {
      const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      return { status: r.status, body: (await r.json()) as Record<string, any> };
    };
    return Object.assign(ask, { cookie: () => cookie });
  };
}

describe("moving to another device", () => {
  it("makes the new device the same player, houses and all", async () => {
    const phone = parlor();
    const old = phone();
    const made = await old("/houses", { name: "The Nichols", owner: "Mikey" });
    expect(made.status).toBe(201);
    const slug = made.body.slug as string;

    const { status, body } = await old("/me/move", { name: "Mikey" });
    expect(status).toBe(200);
    expect(body.code).toMatch(/^[a-z2-9]{8}$/);
    expect(body.minutes).toBe(CODE_MINUTES);

    const fresh = phone();
    // Before: a stranger to the house.
    expect((await fresh(`/houses/${slug}`)).status).not.toBe(200);
    const moved = await fresh(`/me/move/${body.code}`, {});
    expect(moved.status).toBe(200);
    expect(moved.body).toEqual({ same: false, name: "Mikey", houses: [{ slug, name: "The Nichols" }] });
    expect(fresh.cookie()).toBe(old.cookie());
    // After: the owner, on both.
    const house = await fresh(`/houses/${slug}`);
    expect(house.status).toBe(200);
    expect(house.body.me.role).toBe("owner");
    expect((await old(`/houses/${slug}`)).body.me.role).toBe("owner");
  });

  it("gives a code only to a device that is somebody, and only one at a time", async () => {
    const phone = parlor();
    const nobody = phone();
    expect((await nobody("/me/move", {})).status).toBe(400);
    const old = phone();
    await old("/houses", { name: "A house", owner: "Ann" });
    const first = (await old("/me/move", {})).body.code as string;
    const second = (await old("/me/move", {})).body.code as string;
    expect(second).not.toBe(first);
    const fresh = phone();
    expect((await fresh(`/me/move/${first}`, {})).status).toBe(404);
    expect((await fresh(`/me/move/${second}`, {})).status).toBe(200);
  });

  it("takes a code once, however it is typed", async () => {
    const phone = parlor();
    const old = phone();
    await old("/houses", { name: "A house", owner: "Ann" });
    const code = (await old("/me/move", {})).body.code as string;
    expect(tidyCode(` ${code.slice(0, 4).toUpperCase()}-${code.slice(4)} `)).toBe(code);
    const typed = encodeURIComponent(`${code.slice(0, 4).toUpperCase()}-${code.slice(4)}`);
    expect((await phone()(`/me/move/${typed}`, {})).status).toBe(200);
    expect((await phone()(`/me/move/${code}`, {})).status).toBe(404);
  });

  it("says so, and changes nothing, when the code is used on the device it came from", async () => {
    const phone = parlor();
    const old = phone();
    await old("/houses", { name: "A house", owner: "Ann" });
    const before = old.cookie();
    const code = (await old("/me/move", {})).body.code as string;
    const again = await old(`/me/move/${code}`, {});
    expect(again.body.same).toBe(true);
    expect(old.cookie()).toBe(before);
  });

  it("lets a code run out, and stops someone guessing", async () => {
    let clock = 1_000_000;
    const devices = createDevices({ now: () => clock });
    const post = (path: string, cookie = "", address = "203.0.113.5") => devices.fetch(new Request(BASE + path, { method: "POST", headers: { cookie, "x-forwarded-for": address }, body: "{}" }));
    // A cookie as the rooms kit sets it, borrowed from a real parlor.
    const phone = parlor()();
    await phone("/houses", { name: "A house", owner: "Ann" });
    const cookie = phone.cookie();

    const code = ((await (await post("/me/move", cookie))!.json()) as { code: string }).code;
    clock += CODE_MINUTES * 60_000 + 1;
    expect((await post(`/me/move/${code}`))!.status).toBe(404);

    const good = ((await (await post("/me/move", cookie))!.json()) as { code: string }).code;
    for (let i = 0; i < WRONG_TRIES; i++) expect((await post("/me/move/wrongone", "", "198.51.100.9"))!.status).toBe(404);
    // Now even the right code is refused from that address, and still good from another.
    expect((await post(`/me/move/${good}`, "", "198.51.100.9"))!.status).toBe(429);
    expect((await post(`/me/move/${good}`, "", "198.51.100.10"))!.status).toBe(200);
    // Ten minutes on, the address may try again.
    clock += 10 * 60_000 + 1;
    expect((await post("/me/move/wrongone", "", "198.51.100.9"))!.status).toBe(404);
  });

  it("leaves other paths alone", async () => {
    const devices = createDevices();
    expect(await devices.fetch(new Request(`${BASE}/houses`))).toBeNull();
    expect((await devices.fetch(new Request(`${BASE}/me/move`)))!.status).toBe(404);
  });
});
