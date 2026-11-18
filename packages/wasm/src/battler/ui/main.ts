import { mount } from "svelte";
import App from "./App.svelte";
import "./zubra.ts";
import "./styles.css";

export default mount(App, { target: document.getElementById("app")! });

// The game's service worker, one folder up, keeps this page too, so the Back Room opens with no connection.
if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
