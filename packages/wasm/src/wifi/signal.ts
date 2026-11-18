// A game on this wifi is joined without any server: two browsers talk over a WebRTC data channel,
// and what each needs to know about the other to open it (the "offer" and the "answer") is carried
// by hand, as a QR code on one screen read by the other's camera.
//
// A browser's own description of itself (the SDP) is 600 characters, most of it the same every
// time. What differs is two short secrets, the fingerprint of a certificate and where the browser
// can be reached on the network. Those are packed here into a code of about 130 characters, which
// makes a QR code a phone reads easily off another phone, and unpacked into an SDP the other
// browser accepts.
//
// This is the parlor's own way of doing it (packages/web/src/wifi/signal.ts), brought here so the
// games can stand apart from the parlor. The codes are the same format.

/** What one browser has to tell the other to open a channel between them. */
export interface Handshake {
  ufrag: string;
  pwd: string;
  /** The certificate's SHA-256 fingerprint: 64 hex digits, no colons. */
  fingerprint: string;
  /** In an answer: whether this side opens the encrypted connection (it nearly always does). */
  active: boolean;
  /** Where this browser listens on the local network: an address (or the `.local` name browsers give out in its place) and a port. */
  addresses: { host: string; port: number }[];
}

/** No more than this many addresses go in a code: the first few are the ones on the wifi. */
const MOST_ADDRESSES = 4;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
const unhex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));

/** The parts of a browser's SDP that the other side can't guess. */
export function fromSdp(sdp: string): Handshake {
  const one = (pattern: RegExp) => sdp.match(pattern)?.[1]?.trim();
  const ufrag = one(/^a=ice-ufrag:(.+)$/m);
  const pwd = one(/^a=ice-pwd:(.+)$/m);
  const fingerprint = one(/^a=fingerprint:sha-256 (.+)$/im)?.replace(/:/g, "").toUpperCase();
  if (!ufrag || !pwd || !fingerprint || fingerprint.length !== 64) throw new Error("This browser didn't describe a connection the game can use.");
  const addresses: Handshake["addresses"] = [];
  for (const [, component, protocol, host, port, type] of sdp.matchAll(/^a=candidate:\S+ (\d+) (\S+) \d+ (\S+) (\d+) typ (\S+)/gm)) {
    // Only what is on this network: the device's own addresses, over UDP.
    if (component !== "1" || protocol!.toLowerCase() !== "udp" || type !== "host") continue;
    if (!addresses.some((a) => a.host === host && a.port === Number(port))) addresses.push({ host: host!, port: Number(port) });
  }
  return { ufrag, pwd, fingerprint, active: one(/^a=setup:(.+)$/m) !== "passive", addresses: addresses.slice(0, MOST_ADDRESSES) };
}

/** An SDP for a data channel and nothing else, from the parts that were carried over. */
export function toSdp(shake: Handshake, type: "offer" | "answer"): string {
  const pairs = shake.fingerprint.match(/../g)!.join(":");
  return (
    [
      "v=0",
      "o=- 1 2 IN IP4 127.0.0.1",
      "s=-",
      "t=0 0",
      "a=group:BUNDLE 0",
      "a=msid-semantic: WMS",
      "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
      "c=IN IP4 0.0.0.0",
      ...shake.addresses.map((a, i) => `a=candidate:${i + 1} 1 udp ${2122260223 - i} ${a.host} ${a.port} typ host generation 0`),
      "a=end-of-candidates",
      `a=ice-ufrag:${shake.ufrag}`,
      `a=ice-pwd:${shake.pwd}`,
      `a=fingerprint:sha-256 ${pairs}`,
      `a=setup:${type === "offer" ? "actpass" : shake.active ? "active" : "passive"}`,
      "a=mid:0",
      "a=sctp-port:5000",
      "a=max-message-size:262144",
    ].join("\r\n") + "\r\n"
  );
}

/** The code that travels: "1" for this format, then the parts, with commas between (no part can hold one). */
export function pack(shake: Handshake): string {
  return ["1", shake.ufrag, shake.pwd, b64url(unhex(shake.fingerprint)), shake.active ? "a" : "p", shake.addresses.map((a) => `${a.host}!${a.port}`).join(";")].join(",");
}

const NOT_A_CODE = "That isn't a code from a game on this wifi.";

export function unpack(code: string): Handshake {
  const [version, ufrag, pwd, print, role, where, ...more] = code.trim().split(",");
  if (version !== "1" || !ufrag || !pwd || !print || !role || where === undefined || more.length) throw new Error(NOT_A_CODE);
  let fingerprint: string;
  try {
    fingerprint = hex(fromB64url(print));
  } catch {
    throw new Error(NOT_A_CODE);
  }
  if (fingerprint.length !== 64 || !/^[A-Za-z0-9+/]+$/.test(ufrag) || !/^[A-Za-z0-9+/]+$/.test(pwd)) throw new Error(NOT_A_CODE);
  const addresses = where
    .split(";")
    .filter(Boolean)
    .map((entry) => {
      const at = entry.lastIndexOf("!");
      const host = entry.slice(0, at);
      const port = Number(entry.slice(at + 1));
      // An address goes into an SDP line: nothing but what an address is made of.
      if (at < 1 || !/^[A-Za-z0-9.:-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error(NOT_A_CODE);
      return { host, port };
    })
    .slice(0, MOST_ADDRESSES);
  if (!addresses.length) throw new Error("That device isn't on a network: it has to be on the same wifi as this one.");
  return { ufrag, pwd, fingerprint, active: role === "a", addresses };
}

/** The link a host shows: the game's own address, with the offer after the `#` (which never leaves the device). */
export const joinLink = (offer: string, page: string) => `${page.split(/[?#]/)[0]}?wifi=join#${encodeURIComponent(offer)}`;

/** The code in whatever was scanned or pasted: a join link, or the bare code. */
export function codeIn(text: string): string {
  const clean = text.trim();
  const hash = clean.includes("#") ? clean.slice(clean.indexOf("#") + 1) : clean;
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}
