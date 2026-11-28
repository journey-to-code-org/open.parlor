// Forehead on the page: the clock, a buzz, the placings, and where a card sits on a forehead.
import { describe, expect, it } from "vitest";
import { ABOVE_EYES, ACROSS, foreheadOf, moved, onTile, packPose, settle, unpackPose } from "../src/forehead/face";
import { buzzLine, clock, linkWords, placed, STUCK_MS } from "../src/forehead/words";

const name = (seat: number) => ["Mikey", "Grammi", "Delbie"][seat]!;

describe("forehead", () => {
  it("counts the round down in minutes and seconds", () => {
    expect(clock(180_000)).toBe("3:00");
    expect(clock(61_200)).toBe("1:02");
    expect(clock(900)).toBe("0:01");
    expect(clock(-5)).toBe("0:00");
  });

  it("says who was buzzed and who has a new card, to each reader in their own terms", () => {
    const buzz = { n: 1, round: 1, by: 0, seat: 1, redealt: 2 };
    expect(buzzLine(buzz, 0, name)).toBe("Grammi has been buzzed, and loses a point. Delbie's card was given away, so they have a new one.");
    expect(buzzLine(buzz, 1, name)).toBe("You've been buzzed: you lose a point. Delbie's card was given away, so they have a new one.");
    expect(buzzLine(buzz, 2, name)).toBe("Grammi has been buzzed, and loses a point. It was your card that was given away, so you have a new one.");
    expect(buzzLine({ ...buzz, redealt: null }, 2, name)).toBe("Grammi has been buzzed, and loses a point.");
  });

  it("places the players, equal scores sharing a place", () => {
    expect(placed([{ seat: 0, score: 2 }, { seat: 1, score: 5 }, { seat: 2, score: 2 }, { seat: 3, score: -1 }]).map((p) => [p.seat, p.place])).toEqual([[1, 1], [0, 2], [2, 2], [3, 4]]);
  });
});


describe("a card on a forehead", () => {
  it("stands on the brow, as wide as the face, tilted with the head", () => {
    // Level eyes 0.1 of a 640-wide picture apart (64px), across the middle.
    const level = foreheadOf({ x: 0.45, y: 0.5 }, { x: 0.55, y: 0.5 }, 640, 480)!;
    expect(level.x).toBeCloseTo(0.5);
    expect(level.y).toBeCloseTo(0.5 - (ABOVE_EYES * 64) / 480);
    expect(level.w).toBeCloseTo((ACROSS * 64) / 640);
    expect(level.a).toBeCloseTo(0);
    // The head tipped to its left (the picture's right eye lower): the card tips with it, and moves up and over.
    const tipped = foreheadOf({ x: 0.45, y: 0.45 }, { x: 0.55, y: 0.55 }, 480, 480)!;
    expect(tipped.a).toBeCloseTo(Math.PI / 4);
    expect(tipped.x).toBeGreaterThan(0.5);
    expect(tipped.y).toBeLessThan(0.5);
    expect(foreheadOf({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 640, 480)).toBeNull();
  });

  it("lands where the picture is shown, cut to fill the tile, and mirrored on your own", () => {
    const pose = { x: 0.75, y: 0.45, w: 0.2, a: 0.1 };
    // A 4:3 picture on a 4:3 tile: where it is.
    expect(onTile(pose, 4 / 3, 4 / 3)).toEqual({ left: 0.75, top: 0.45, width: 0.2, angle: 0.1 });
    // Mirrored: the other side, tilted the other way.
    expect(onTile(pose, 4 / 3, 4 / 3, true)).toMatchObject({ left: 0.25, angle: -0.1 });
    // A 16:9 picture on a 4:3 tile is cut at the sides, so everything is further from the middle and wider.
    const wide = onTile(pose, 16 / 9, 4 / 3);
    expect(wide.left).toBeCloseTo(0.5 + 0.25 * (4 / 3));
    expect(wide.top).toBeCloseTo(0.45);
    expect(wide.width).toBeCloseTo(0.2 * (4 / 3));
    // A phone held upright (3:4) is cut at the top and bottom.
    const tall = onTile(pose, 3 / 4, 4 / 3);
    expect(tall.left).toBeCloseTo(0.75);
    expect(tall.top).toBeCloseTo(0.5 - 0.05 * (16 / 9));
    // A brow near the top leaves no room for the card above it, so the card comes down onto the tile.
    expect(onTile({ ...pose, y: 0.3 }, 3 / 4, 4 / 3).top).toBeCloseTo(0.32);
    // A head half out of the picture keeps its card on the tile.
    expect(onTile({ x: 1.1, y: -0.2, w: 0.2, a: 0 }, 4 / 3, 4 / 3)).toMatchObject({ left: 0.88, top: 0.32 });
  });

  it("glides rather than jumps, and turns the short way round", () => {
    const a = { x: 0, y: 0, w: 0.2, a: 3 };
    const b = settle(a, { x: 1, y: 1, w: 0.4, a: -3 });
    expect(b.x).toBeCloseTo(0.5);
    expect(b.w).toBeCloseTo(0.3);
    expect(Math.abs(b.a)).toBeGreaterThan(3);
    expect(settle(null, a)).toBe(a);
  });

  it("is sent as four short numbers, and anything else off the wire is no face", () => {
    const pose = { x: 0.123456, y: 0.5, w: 0.25, a: -0.0004 };
    expect(packPose(pose)).toEqual([0.123, 0.5, 0.25, -0]);
    expect(unpackPose(JSON.parse(JSON.stringify(packPose(pose))))).toEqual({ x: 0.123, y: 0.5, w: 0.25, a: 0 });
    expect(packPose(null)).toBeNull();
    for (const junk of [null, "x", [1, 2, 3], [0.5, 0.5, 0, 0], [0.5, 0.5, 9, 0], [0.5, 0.5, 0.2, 7], [Infinity, 0, 0.1, 0], { x: 1 }]) expect(unpackPose(junk)).toBeNull();
    expect(moved(pose, { ...pose, x: pose.x + 0.001 })).toBe(false);
    expect(moved(pose, { ...pose, x: pose.x + 0.01 })).toBe(true);
    expect(moved(null, pose)).toBe(true);
    expect(moved(null, null)).toBe(false);
  });
});

describe("a call that isn't up yet", () => {
  const link = { state: "connecting" as const, since: 1000, route: null, mine: ["host", "srflx"], theirs: ["host"] };
  it("says it is connecting, then that it can't, and why", () => {
    expect(linkWords({ ...link, state: "connected" }, "Wife", false, 99_000)).toBeNull();
    expect(linkWords(link, "Wife", false, 2000)).toMatchObject({ title: "Connecting to Wife…", stuck: false, why: null });
    const stuck = linkWords(link, "Wife", false, 1000 + STUCK_MS)!;
    expect(stuck).toMatchObject({ title: "Can't connect to Wife", stuck: true });
    expect(stuck.why).toMatch(/no relay server/);
    expect(stuck.details).toBe("Ways this device found: on this network, through the internet. Ways Wife's found: on this network. This parlor has no relay server (TURN).");
    expect(linkWords({ ...link, state: "failed" }, "Wife", true, 2000)!.why).toMatch(/even through the parlor's relay/);
    expect(linkWords({ ...link, theirs: [] }, "Wife", false, 1000 + STUCK_MS)!.why).toMatch(/Nothing has come back/);
  });
});
