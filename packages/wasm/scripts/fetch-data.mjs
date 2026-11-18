// Fetches the game's data into public/data/ (which git ignores): the Freedoom WAD and its licence
// and credits, out of the release archive on GitHub, checked against the hashes in
// games/shooter/data.json. The WAD is stored gzipped, a third of the size: the page unpacks it, so
// the download is small whatever the server does. Does nothing when the files are there and right.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync, inflateRawSync } from "node:zlib";
import { fetchChecked, root } from "./toolchain.mjs";

// Which release, where it is, and what it should hash to ("sha256" is the WAD's, unpacked).
// "file" is its name on the site: the version is in it, so a new release is a new address. "notices" ship beside it, as its licence asks.
const FREEDOOM = JSON.parse(readFileSync(join(root, "games", "shooter", "data.json"), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The files of a zip archive by name, read from its central directory. */
function unzip(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("not a zip archive");
  const files = new Map();
  let at = zip.readUInt32LE(end + 16);
  for (let i = zip.readUInt16LE(end + 10); i > 0; i--) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    files.set(name, () => {
      const packed = zip.subarray(start, start + size);
      if (method === 0) return packed;
      if (method === 8) return inflateRawSync(packed);
      throw new Error(`${name}: zip method ${method} isn't one this script reads`);
    });
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return files;
}

const dir = join(root, "public", "data");
const wad = join(dir, FREEDOOM.file);
const wanted = [wad, ...Object.values(FREEDOOM.notices).map((name) => join(dir, name))];
const unpacked = (path) => {
  try {
    return gunzipSync(readFileSync(path));
  } catch {
    return Buffer.alloc(0);
  }
};
if (wanted.every(existsSync) && sha256(unpacked(wad)) === FREEDOOM.sha256) {
  console.log(`data: Freedoom ${FREEDOOM.version} is already in public/data`);
} else {
  console.log(`data: fetching Freedoom ${FREEDOOM.version}`);
  const files = unzip(await fetchChecked(FREEDOOM.archive, FREEDOOM.archiveSha256));
  const member = (name) => {
    const read = files.get(name);
    if (!read) throw new Error(`${name} is not in the Freedoom archive`);
    return read();
  };
  const bytes = member(FREEDOOM.member);
  if (sha256(bytes) !== FREEDOOM.sha256) throw new Error(`${FREEDOOM.member}: not the file games/shooter/data.json expects`);
  mkdirSync(dir, { recursive: true });
  const packed = gzipSync(bytes, { level: 9 });
  writeFileSync(wad, packed);
  for (const [from, to] of Object.entries(FREEDOOM.notices)) writeFileSync(join(dir, to), member(from));
  console.log(`data: ${(bytes.length / 1048576).toFixed(1)} MB, ${(packed.length / 1048576).toFixed(1)} MB gzipped, at public/data/${FREEDOOM.file}`);
}
