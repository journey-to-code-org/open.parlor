// The server's address on the wifi, printed at start-up for a parlor run at home.
import { describe, expect, it } from "vitest";
import { isPrivate, lanAddresses, lanNotice, terminalQr } from "../src/lan.js";

const nic = (address: string, internal = false, family = "IPv4") => ({ address, internal, family, netmask: "", mac: "", cidr: null }) as never;

describe("the parlor on the wifi", () => {
  it("knows a home network's addresses from the internet's", () => {
    for (const a of ["192.168.1.20", "10.0.0.5", "172.16.4.1", "172.31.255.1"]) expect(isPrivate(a), a).toBe(true);
    for (const a of ["8.8.8.8", "172.32.0.1", "100.64.0.1", "169.254.1.1", "127.0.0.1"]) expect(isPrivate(a), a).toBe(false);
  });

  it("lists this machine's addresses on the wifi, and only those", () => {
    const interfaces = { lo: [nic("127.0.0.1", true)], wlan0: [nic("192.168.1.20"), nic("fe80::1", false, "IPv6")], eth0: [nic("203.0.113.7")], docker0: [nic("172.17.0.1")] };
    expect(lanAddresses(8787, interfaces)).toEqual(["http://192.168.1.20:8787", "http://172.17.0.1:8787"]);
  });

  it("says nothing on a host with no such address", () => {
    expect(lanNotice(8787, true, { lo: [nic("127.0.0.1", true)], eth0: [nic("203.0.113.7")] })).toBeNull();
  });

  it("draws the QR code only for a person at a terminal", () => {
    const interfaces = { wlan0: [nic("192.168.1.20")] };
    expect(lanNotice(8787, false, interfaces)).toBe("on this wifi: http://192.168.1.20:8787");
    const shown = lanNotice(8787, true, interfaces)!;
    expect(shown).toContain("█");
    expect(shown.split("\n").length).toBeGreaterThan(10);
  });

  it("draws a square code, every line the same width", () => {
    const lines = terminalQr("http://192.168.1.20:8787").split("\n").map((line) => line.replace(/\x1b\[\d+m/g, ""));
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
    // Two rows of modules to a line of text.
    expect(Math.abs(lines.length * 2 - lines[0]!.length)).toBeLessThanOrEqual(1);
  });
});
