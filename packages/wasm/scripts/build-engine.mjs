// Compiles a game's C to one .wasm file: node scripts/build-engine.mjs <game>
//
// The game's folder says what to build in build.json: the folders of C and the defines. (The
// functions the page may call are marked in the C itself, with export_name.) Each file is compiled
// by clang for wasm32-wasip1 and the lot is linked by wasm-ld as a WASI reactor: a module with no
// main(), whose exports the page calls.
// Objects are kept in .build/ and only recompiled when their source, or any header, is newer.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { sourcesHash } from "./sources.mjs";
import { builtins, ensureToolchain, libc, root, sysroot, tool } from "./toolchain.mjs";

const exec = promisify(execFile);
/** Runs a program; if it fails, what it said and nothing else. */
const run = (program, args) =>
  exec(program, args).catch((error) => {
    process.stderr.write(error.stderr || String(error));
    process.exit(1);
  });
const game = process.argv[2];
if (!game) throw new Error("usage: node scripts/build-engine.mjs <game>");
const dir = join(root, "games", game);
const config = JSON.parse(readFileSync(join(dir, "build.json"), "utf8"));
const out = join(dir, config.output);

// A game with "freestanding": true is C that needs no C library (the market sim): compiled for plain
// wasm32 with no WASI, so there is no toolchain to fetch and the module imports nothing.
const freestanding = config.freestanding === true;
if (!freestanding) await ensureToolchain();
const clang = tool(["clang", "clang-20", "clang-19", "clang-18", "clang-17"], "clang");
const linker = tool(["wasm-ld", "wasm-ld-20", "wasm-ld-19", "wasm-ld-18", "wasm-ld-17"], "wasm-ld (part of lld)");

const folders = config.sources.map((folder) => join(dir, folder));
const files = (ext) => folders.flatMap((folder) => readdirSync(folder).filter((name) => name.endsWith(ext)).map((name) => join(folder, name)));
const sources = files(".c").filter((path) => !(config.skip ?? []).includes(basename(path)));
const newestHeader = Math.max(statSync(join(dir, "build.json")).mtimeMs, ...files(".h").map((path) => statSync(path).mtimeMs));

const objects = join(root, ".build", game);
mkdirSync(objects, { recursive: true });
const flags = [
  ...(freestanding ? ["--target=wasm32", "-ffreestanding", "-nostdlib"] : ["--target=wasm32-wasip1", `--sysroot=${sysroot}`]),
  "-O2",
  "-c",
  ...folders.map((folder) => `-I${folder}`),
  ...config.defines.map((define) => `-D${define}`),
  ...(config.cflags ?? []),
];

const jobs = sources.map((source) => {
  const object = join(objects, basename(source).replace(/\.c$/, ".o"));
  const fresh = existsSync(object) && statSync(object).mtimeMs > Math.max(newestHeader, statSync(source).mtimeMs);
  return { source, object, fresh };
});
const stale = jobs.filter((job) => !job.fresh);
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(cpus().length, stale.length) }, async () => {
    while (next < stale.length) {
      const job = stale[next++];
      const { stderr } = await run(clang, [...flags, job.source, "-o", job.object]);
      if (stderr && process.env.WARNINGS) process.stderr.write(stderr);
    }
  }),
);

await run(
  linker,
  freestanding
    ? [...jobs.map((job) => job.object), "--no-entry", "--stack-first", "-z", `stack-size=${config.stack ?? 1048576}`, "--strip-debug", "-o", out]
    : [
        join(libc, "crt1-reactor.o"),
        ...jobs.map((job) => job.object),
        `-L${libc}`,
        "-lc",
        builtins,
        "--no-entry",
        "--export=_initialize",
        "--stack-first",
        "-z",
        `stack-size=${config.stack ?? 1048576}`,
        "--strip-debug",
        "-o",
        out,
      ],
);
// What this .wasm was compiled from: test/built.test.ts checks it against the sources.
writeFileSync(`${out}.json`, `${JSON.stringify({ sources: sourcesHash(dir) }, null, 2)}\n`);
console.log(`${game}: ${stale.length} of ${jobs.length} files compiled, ${(statSync(out).size / 1024).toFixed(0)} KB at games/${game}/${config.output}`);
