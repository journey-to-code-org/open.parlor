import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import zubra from "@zubra/unplugin/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // The parlor serves this page at /wasm/; the GitHub Pages build sets its own base.
  base: process.env.BASE_PATH ?? "/wasm/",
  // The editor (editor/) is Svelte on Zubra components. In a Svelte project a .zb import is the
  // custom element itself; the typings Zubra writes for them go in this package's own folder.
  // The stockroom (market/) is Solid: its files are .tsx, which only Solid's plugin takes, so the
  // two don't meet (there is no React here to share the extension with).
  plugins: [zubra({ dts: { dir: ".zubra/types" } }), svelte(), solid({ include: "src/market/**" })],
  // `npm run dev -w @open-parlor/server` has the rooms for playing together, on 8787.
  server: { port: 5177, proxy: { "/wasm/play": { target: "http://localhost:8787", ws: true } } },
  build: {
    // The engine's .wasm is fetched and compiled as it streams in, not inlined into the script.
    assetsInlineLimit: 0,
    target: "es2022",
    // Three pages: the game, the editor for its pictures and sounds, and the stockroom sim.
    rollupOptions: { input: { game: local("index.html"), editor: local("editor/index.html"), market: local("market/index.html") } },
  },
  resolve: {
    alias: {
      // The parlor's copies of zubra-ui's components, from source.
      "@open-parlor/ui": local("../ui/src"),
    },
  },
});
