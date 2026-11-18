// What it takes to compile C to WebAssembly here, beyond the clang and wasm-ld already on the
// machine: the WASI C library and clang's runtime for wasm32, from the wasi-sdk release on GitHub.
// Both are fetched once into .toolchain/ (which git ignores) and checked against the hashes below.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const toolchain = join(root, ".toolchain");

const RELEASE = "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-25";
const PARTS = [
  { dir: "sysroot", file: "wasi-sysroot-25.0.tar.gz", sha256: "d09c62c18efcddffe4b2fdd8c5830109cc8e36130cdbc9acdc0bd1b204c942bb" },
  { dir: "rt", file: "libclang_rt.builtins-wasm32-wasi-25.0.tar.gz", sha256: "13aca55665321200b9659b292615adf5110ace9e891ab94511badd970553ca18" },
];

export const sysroot = join(toolchain, "sysroot");
export const libc = join(sysroot, "lib", "wasm32-wasip1");
export const builtins = join(toolchain, "rt", "libclang_rt.builtins-wasm32.a");

/** The first of these programs that runs, or an error that says what to install. */
export function tool(names, what) {
  for (const name of names) {
    try {
      execFileSync(name, ["--version"], { stdio: "ignore" });
      return name;
    } catch {}
  }
  throw new Error(`${what} not found (tried ${names.join(", ")}). On Debian or Ubuntu: apt install clang lld`);
}

export async function fetchChecked(url, sha256) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== sha256) throw new Error(`${url}: expected sha256 ${sha256}, got ${got}`);
  return bytes;
}

/** Fetches whatever of the toolchain isn't here yet. */
export async function ensureToolchain() {
  for (const part of PARTS) {
    const dir = join(toolchain, part.dir);
    const stamp = join(dir, ".sha256");
    if (existsSync(stamp) && readFileSync(stamp, "utf8") === part.sha256) continue;
    console.log(`toolchain: fetching ${part.file}`);
    const bytes = await fetchChecked(`${RELEASE}/${part.file}`, part.sha256);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const archive = join(toolchain, part.file);
    writeFileSync(archive, bytes);
    execFileSync("tar", ["xzf", archive, "-C", dir, "--strip-components=1"]);
    rmSync(archive);
    writeFileSync(stamp, part.sha256);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await ensureToolchain();
