// Where this server can be reached on the local network, for a parlor run on a laptop or a
// Raspberry Pi when the internet is out: everyone on the same wifi opens the address, or scans the
// QR code printed with it. (docs/LOCAL-PLAY.md)
import { loadQr, type Code } from "@journey-to-code/symbology";
import { networkInterfaces } from "node:os";

const qr = await loadQr();

/** A private IPv4 address: one a home router, or a phone's hotspot, hands out. */
export const isPrivate = (address: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);

/** This machine's addresses on the networks it is joined to, as addresses of the parlor. */
export function lanAddresses(port: number, interfaces = networkInterfaces()): string[] {
  const found: string[] = [];
  for (const list of Object.values(interfaces)) {
    for (const entry of list ?? []) {
      if (entry.family === "IPv4" && !entry.internal && isPrivate(entry.address)) found.push(`http://${entry.address}:${port}`);
    }
  }
  return [...new Set(found)];
}

/** A QR code for a terminal: two rows of modules to a line of text, dark on light whatever the terminal's colours. */
function darkAt(code: Code, row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < code.size && col < code.size && code.modules[row * code.size + col] === 1;
}

export function terminalQr(text: string): string {
  const code = qr.encode(text);
  const n = code.size;
  const quiet = 2;
  const dark = (row: number, col: number) => darkAt(code, row, col);
  const lines: string[] = [];
  for (let row = -quiet; row < n + quiet; row += 2) {
    let line = "";
    for (let col = -quiet; col < n + quiet; col++) {
      const top = dark(row, col);
      const bottom = dark(row + 1, col);
      line += top && bottom ? " " : top ? "▄" : bottom ? "▀" : "█";
    }
    // Black on white, set outright: a code drawn in a dark terminal's own colours reads as its negative.
    lines.push(`\x1b[47m\x1b[30m${line}\x1b[0m`);
  }
  return lines.join("\n");
}

/** What the server says at start-up about being reached on the wifi; nothing where it has no such address (a host in the cloud). */
export function lanNotice(port: number, tty: boolean, interfaces = networkInterfaces()): string | null {
  const addresses = lanAddresses(port, interfaces);
  if (!addresses.length) return null;
  const lines = [`on this wifi: ${addresses.join("  ")}`];
  // The picture only where a person is looking at it: not in a log file.
  if (tty) lines.push(terminalQr(addresses[0]!), "scan to open the parlor from a phone on the same wifi (no internet needed)");
  return lines.join("\n");
}
