import { mount } from "svelte";
import { load } from "../tables.ts";
import App from "./App.svelte";
import "./zubra.ts";
import "./styles.css";

// The host's tuned numbers, if the parlor serving this page has any; the game's own otherwise (and with no
// connection, or on a site that isn't the parlor). Asked once, before the first card is dealt, so a run
// is played on one set of numbers from start to end. A slow answer isn't waited for.
const tables = await load(async (url) => {
  const answer = await fetch(url, { signal: AbortSignal.timeout(2000), headers: { accept: "application/json" } });
  return answer.ok && (answer.headers.get("content-type") ?? "").includes("json") ? answer.json() : null;
});

export default mount(App, { target: document.getElementById("app")!, props: { tables } });

// The game's service worker, one folder up, keeps this page too, so the Back Room opens with no connection.
if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
