// Packs the channel as the zip a Roku in developer mode takes (docs/TV.md):
//
//   PARLOR_URL=http://192.168.1.20:8787 node scripts/build.mjs   → dist/open-parlor-roku.zip
//
// PARLOR_URL is written into source/config.brs in the zip, as the address the channel starts with
// (it can be changed on the television with *). No dependencies: the zip is written here, stored.
import { crc32 } from "node:zlib";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const parts = ["manifest", "source", "components", "images"];

const files = [];
const walk = (path) => {
  if (statSync(path).isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
  else files.push(path);
};
for (const part of parts) walk(join(root, part));

const server = (process.env.PARLOR_URL ?? "").replace(/\/+$/, "");
if (server && !/^https?:\/\/[^"\s]+$/.test(server)) throw new Error(`PARLOR_URL should look like http://192.168.1.20:8787, not ${server}`);

const entries = files.map((path) => {
  const name = relative(root, path).split("\\").join("/");
  let data = readFileSync(path);
  if (name === "source/config.brs" && server) data = Buffer.from(data.toString("utf8").replace('return ""', `return "${server}"`));
  return { name: Buffer.from(name), data };
});

const local = [];
const central = [];
let offset = 0;
for (const { name, data } of entries) {
  const crc = crc32(data) >>> 0;
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(10, 4); // version needed
  head.writeUInt16LE(0x0800, 6); // names in UTF-8
  head.writeUInt16LE(0, 8); // stored
  head.writeUInt16LE(0x21, 12); // 1 January 1980
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(data.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  local.push(head, name, data);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4);
  dir.writeUInt16LE(10, 6);
  dir.writeUInt16LE(0x0800, 8);
  dir.writeUInt16LE(0x21, 14);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(data.length, 20);
  dir.writeUInt32LE(data.length, 24);
  dir.writeUInt16LE(name.length, 28);
  dir.writeUInt32LE(offset, 42);
  central.push(dir, name);
  offset += head.length + name.length + data.length;
}
const dirSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(dirSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(join(root, "dist"), { recursive: true });
const out = join(root, "dist", "open-parlor-roku.zip");
writeFileSync(out, Buffer.concat([...local, ...central, end]));
console.log(`${relative(process.cwd(), out)}: ${entries.length} files${server ? `, starting at ${server}` : ", asks for the parlor's address on first run"}`);
