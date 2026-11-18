/** @jsxImportSource preact */
// Loaded when asked for, with a Zubra component the page hasn't used until then.
import "@open-parlor/ui/zubra-ui/range-slider.zb?element";
import { useState } from "preact/hooks";

export default function Lazy() {
  const [level, setLevel] = useState(50);
  return (
    <>
      <range-slider data-t="f-lazy" label="Late" value={level} onvaluechange={(e: CustomEvent<number>) => setLevel(e.detail)} />
      <output data-t="f-lazy-out">{level}</output>
    </>
  );
}
