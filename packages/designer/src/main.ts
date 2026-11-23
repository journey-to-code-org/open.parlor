import { mount, unmount } from "svelte";
import App from "./App.svelte";
import ChipDesigner from "./ChipDesigner.svelte";
import "./zubra";
import "./styles.css";

// One page, two designers: the cards at /designer/, the chips at /designer/#chips.
const target = document.getElementById("app")!;
const wanted = () => (location.hash === "#chips" ? ChipDesigner : App);
let shown = wanted();
let app = mount(shown, { target });
addEventListener("hashchange", () => {
  if (wanted() === shown) return;
  void unmount(app);
  shown = wanted();
  app = mount(shown, { target });
  scrollTo({ top: 0 });
});

export default app;
