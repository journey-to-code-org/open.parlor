// The app's few unit tests are plain sums (where a point of a table lands on the screen), so they
// run in Node with none of the app's build plugins.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@cardroom/games": local("../games/src/index.ts"), "@cardroom/physics": local("../physics/src/index.ts"), "@spades/rules": local("../rules/src/index.ts") } },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
