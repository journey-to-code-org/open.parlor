import { defineConfig } from "vite";

export default defineConfig({
  // The parlor serves this page at /wasm/; the GitHub Pages build sets its own base.
  base: process.env.BASE_PATH ?? "/wasm/",
  server: { port: 5177 },
  // The engine's .wasm is fetched and compiled as it streams in, not inlined into the script.
  build: { assetsInlineLimit: 0, target: "es2022" },
});
