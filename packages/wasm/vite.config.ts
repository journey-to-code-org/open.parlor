import { defineConfig } from "vite";

export default defineConfig({
  // The parlor serves this page at /wasm/; the GitHub Pages build sets its own base.
  base: process.env.BASE_PATH ?? "/wasm/",
  // `npm run dev -w @open-parlor/server` has the rooms for playing together, on 8787.
  server: { port: 5177, proxy: { "/wasm/play": { target: "http://localhost:8787", ws: true } } },
  // The engine's .wasm is fetched and compiled as it streams in, not inlined into the script.
  build: { assetsInlineLimit: 0, target: "es2022" },
});
