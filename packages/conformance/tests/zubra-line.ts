// The line these checks are of. A run on 5.x, or on a 6.x older than 6.0.2, is not the run the notes describe.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

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

/** `^6.0.2`: major 6, and not older than 6.0.2. */
export function onZubra6(version: string): boolean {
  const [major, minor = 0, patch = 0] = version.split(".").map((part) => Number(part));
  return major === 6 && Number.isFinite(minor) && Number.isFinite(patch) && (minor > 0 || patch >= 2);
}
