// The line these checks are of: the range this package declares for Zubra, so bumping it in
// package.json moves the gate with it. A run on another major, or on a version older than the
// range's floor, is not the run the notes describe.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const ZUBRA_PACKAGES = ["@zubra/runtime", "@zubra/compiler", "@zubra/unplugin"] as const;

export function zubraVersion(name: string): string {
  // The installed path uses the platform's separators, so it is not a substring of the package name.
  let dir = dirname(require.resolve(name));
  for (let i = 0; i < 8; i++) {
    const file = join(dir, "package.json");
    if (existsSync(file)) {
      const pkg = JSON.parse(readFileSync(file, "utf8")) as { name?: string; version: string };
      if (pkg.name === name) return pkg.version;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not find the installed ${name}`);
}

type Deps = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

/** The range this package declares for `name`, e.g. `^6.0.5`. */
export function declaredRange(name: string): string {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as Deps;
  const range = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
  if (!range) throw new Error(`${name} is not declared in this package's package.json`);
  return range;
}

function parts(version: string): [number, number, number] {
  const [major, minor = 0, patch = 0] = version.split(/[-+]/)[0].split(".").map((part) => Number(part));
  return [major, minor, patch];
}

/** Whether `version` is in a caret range such as `^6.0.5`: the same major, and not older than the floor. */
export function satisfiesCaret(version: string, range: string): boolean {
  const match = /^\^(\d+\.\d+\.\d+)$/.exec(range);
  if (!match) throw new Error(`expected a caret range like ^6.0.5, got ${range}`);
  const [fMajor, fMinor, fPatch] = parts(match[1]);
  const [major, minor, patch] = parts(version);
  if (![major, minor, patch].every(Number.isFinite)) return false;
  return major === fMajor && (minor > fMinor || (minor === fMinor && patch >= fPatch));
}
