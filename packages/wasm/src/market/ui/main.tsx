import { render } from "solid-js/web";
import { App } from "./App.tsx";
import "./zubra.ts";
import "./market.css";

render(() => <App />, document.getElementById("app")!);

// The game's service worker, one folder up, keeps this page too, so the stockroom opens with no connection.
if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
