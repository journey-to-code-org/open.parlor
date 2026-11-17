/* @jsxImportSource solid-js */
// Loaded when asked for, with a Zubra component the page hasn't used until then.
import "@open-parlor/ui/zubra-ui/range-slider.zb?element";
import { createSignal } from "solid-js";

export default function Lazy() {
  const [level, setLevel] = createSignal(50);
  return (
    <>
      <range-slider data-t="f-lazy" prop:label="Late" prop:value={level()} on:valuechange={(e: CustomEvent<number>) => setLevel(e.detail)} />
      <output data-t="f-lazy-out">{level()}</output>
    </>
  );
}
