// A game on the wifi: the code that carries one browser's offer to the other, and the QR code it rides in.
// The same checks the parlor makes of its own copy (packages/web/test/wifi-signal.test.ts).
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { qrModules } from "../src/wifi/qr.ts";
import { codeIn, fromSdp, joinLink, pack, toSdp, unpack } from "../src/wifi/signal.ts";

// What Chrome says of itself for a data channel with no ICE servers (the secrets are made up).
const CHROME_OFFER = [
  "v=0",
  "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "a=extmap-allow-mixed",
  "a=msid-semantic: WMS",
  "m=application 54321 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=candidate:1234567890 1 udp 2113937151 2e1f5b57-dc08-4836-b910-367f2613a852.local 54321 typ host generation 0 network-cost 999",
  "a=candidate:987654321 1 tcp 1518280447 192.168.1.20 9 typ host tcptype active generation 0",
  "a=candidate:555 1 udp 1677729535 203.0.113.9 40000 typ srflx raddr 0.0.0.0 rport 0 generation 0",
  "a=ice-ufrag:aB3+",
  "a=ice-pwd:Qx7/abcdefghijklmnopqr+1",
  "a=ice-options:trickle",
  "a=fingerprint:sha-256 0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9:0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9",
  "a=setup:actpass",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:262144",
  "",
].join("\r\n");

describe("the code a game on the wifi is joined by", () => {
  it("keeps the secrets, the fingerprint and the addresses on this network, and nothing else", () => {
    const shake = fromSdp(CHROME_OFFER);
    expect(shake.ufrag).toBe("aB3+");
    expect(shake.pwd).toBe("Qx7/abcdefghijklmnopqr+1");
    expect(shake.fingerprint).toBe("0A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F9");
    // Not the TCP one, and not the one a STUN server would have found.
    expect(shake.addresses).toEqual([{ host: "2e1f5b57-dc08-4836-b910-367f2613a852.local", port: 54321 }]);
  });

  it("comes back out as it went in", () => {
    const shake = fromSdp(CHROME_OFFER);
    expect(unpack(pack(shake))).toEqual(shake);
    expect(unpack(pack({ ...shake, active: false, addresses: [{ host: "192.168.1.20", port: 5 }, { host: "fe80::1c2d:3e4f", port: 65535 }] })).addresses).toHaveLength(2);
  });

  it("is short enough for a QR code a phone reads off another phone", () => {
    const code = pack(fromSdp(CHROME_OFFER));
    expect(code.length).toBeLessThan(160);
    const link = joinLink(code, "https://parlor.example/wasm/?room=ABCD#old");
    expect(link.length).toBeLessThan(225);
    // 57 modules a side or fewer: about 5 pixels each on the narrowest phone.
    expect(qrModules(link).length).toBeLessThanOrEqual(57);
  });

  it("makes an SDP that says the same things", () => {
    const shake = fromSdp(CHROME_OFFER);
    const offer = toSdp(shake, "offer");
    expect(fromSdp(offer)).toEqual(shake);
    expect(offer).toContain("a=setup:actpass");
    expect(offer).toContain("m=application 9 UDP/DTLS/SCTP webrtc-datachannel");
    expect(toSdp({ ...shake, active: true }, "answer")).toContain("a=setup:active");
    expect(offer.endsWith("\r\n")).toBe(true);
  });

  it("travels in a link, after the #, and is found in whatever gets scanned or pasted", () => {
    const code = pack(fromSdp(CHROME_OFFER));
    const link = joinLink(code, "https://parlor.example/wasm/?room=ABCD#old");
    // The page's own address, without whatever was after its "?" or "#".
    expect(link.startsWith("https://parlor.example/wasm/?wifi=join#")).toBe(true);
    expect(codeIn(link)).toBe(code);
    expect(codeIn(`  ${code}\n`)).toBe(code);
    expect(codeIn(new URL(link).hash)).toBe(code);
  });

  it("refuses what isn't one, in words, and never lets a stray line into the SDP", () => {
    expect(() => unpack("hello")).toThrow(/isn't a code/);
    expect(() => unpack("https://example.com/")).toThrow(/isn't a code/);
    const code = pack(fromSdp(CHROME_OFFER));
    expect(() => unpack(code.replace(/^1,/, "2,"))).toThrow(/isn't a code/);
    expect(() => unpack(code.replace(".local!54321", ".local\r\na=evil!54321"))).toThrow(/isn't a code/);
    expect(() => unpack(code.replace("aB3+", "a\nb"))).toThrow(/isn't a code/);
    expect(() => unpack(code.slice(0, code.lastIndexOf(",") + 1))).toThrow(/same wifi/);
  });
});

describe("the QR code", () => {
  it("drawn here is read back by the decoder the scanner uses", () => {
    const link = joinLink(pack(fromSdp(CHROME_OFFER)), "https://parlor.example/wasm/");
    const modules = qrModules(link);
    // Paint it as the screen does: 4 pixels a module, a white border, black on white.
    const scale = 4;
    const quiet = 4;
    const size = (modules.length + quiet * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    modules.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (!dark) return;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const at = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
            pixels[at] = pixels[at + 1] = pixels[at + 2] = 0;
          }
      }),
    );
    expect(jsQR(pixels, size, size)?.data).toBe(link);
  });
});
