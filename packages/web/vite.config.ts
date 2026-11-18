import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import zubra from "@zubra/unplugin/vite";
import { defineConfig } from "vite";

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  // Served from https://<user>.github.io/card-room/ on GitHub Pages.
  base,
  // When this copy of the page was built: a bug report says so, since a phone can hold on to an old page.
  define: { __BUILT__: JSON.stringify(new Date().toISOString().slice(0, 16) + "Z") },
  // In .tsx files, a .zb import is a typed React component: props in, on<Event> handlers out.
  // The start page's game picker is a Vue island inside the React app: in a .vue file, a .zb import
  // is a Vue component (Zubra's Vue adapter), so the same components serve both frameworks. The
  // Mini Golf and bowling editors are Svelte (src/golf/*.svelte): there a .zb import asks for the
  // element itself (`?element`), which Svelte uses like any other.
  plugins: [
    // Each app keeps the typings Zubra writes for it in its own folder: the components are shared with
    // apps in other frameworks.
    zubra({ dts: { dir: ".zubra/types" } }),
    react(),
    vue(),
    svelte(),
    {
      // Link previews need the image's full address. With SITE_ORIGIN (the Pages build) it's written
      // in now; otherwise __ORIGIN__ stays for the server to fill in with its own address.
      name: "og-base",
      transformIndexHtml: (html) => html.replaceAll("__OG_BASE__", `${process.env.SITE_ORIGIN ?? "__ORIGIN__"}${base}`),
    },
  ],
  // The practice tables' bot worker (src/kit/bot.worker.ts) is a module, like the page.
  worker: { format: "es" },
  // `npm run dev -w @open-parlor/server` serves the rooms and the sync log on 8787.
  server: { proxy: Object.fromEntries(["/rooms", "/_zb", "/houses", "/challenges", "/lobby", "/push", "/bugs", "/designs", "/courses", "/moderation", "/catalogue", "/spectate", "/me", "/second"].map((p) => [p, "http://localhost:8787"] as [string, string | { target: string; ws: boolean }]).concat([["/live", { target: "http://localhost:8787", ws: true }]])) },
  resolve: {
    alias: {
      "@open-parlor/ui": local("../ui/src"),
    },
  },
});
