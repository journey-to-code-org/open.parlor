// The app's few unit tests are plain sums (where a point of a table lands on the screen), so they
// run in Node with none of the app's build plugins.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
