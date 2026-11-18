import { defineConfig } from "vitest/config";

// The tests are of plain TypeScript (the engine, the rooms, the game's data): they need none of
// the page's build, and the Svelte plugin in vite.config.ts doesn't start under vitest's own Vite.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
