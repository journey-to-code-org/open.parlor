// Loaded when asked for, with a Zubra component the page hasn't used until then.
import RangeSlider from "@open-parlor/ui/zubra-ui/range-slider.zb";
import { useState } from "react";

export default function Lazy() {
  const [level, setLevel] = useState(50);
  return (
    <>
      <RangeSlider data-t="f-lazy" label="Late" value={level} onValueChange={(e: CustomEvent<number>) => setLevel(e.detail)} />
      <output data-t="f-lazy-out">{level}</output>
    </>
  );
}
