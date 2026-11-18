// The Svelte editors' playtests: once painting stops for a moment, each hole the editor holds is
// played by the computer (playtest.ts), and the answers come back as state.
import type { CustomHole, CustomLane, HoleTest, LaneTest } from "@open-parlor/courses";
import { untrack } from "svelte";
import { playtest, playtestKey } from "./playtest";

/**
 * How the computer gets on with `items()`: each null while it's playing that one (or hasn't been
 * asked yet), and for a null item. Call while a component starts, like any effect.
 */
export function playtests<T extends HoleTest | LaneTest>(kind: "minigolf" | "bowling", items: () => (CustomHole | CustomLane | null)[]) {
  let results = $state.raw<Record<string, T>>({});
  // Asked again only when a grid changes: a new list with the same holes is the same ask.
  const keys = $derived(items().map((i) => (i ? playtestKey(i) : "")).join("|"));
  $effect(() => {
    void keys;
    const asking = untrack(items);
    let live = true;
    const wait = setTimeout(() => {
      for (const item of asking) {
        if (!item) continue;
        void playtest<T>(kind, item).then((r) => {
          if (live && r) results = { ...results, [playtestKey(item)]: r };
        });
      }
    }, 450);
    return () => {
      live = false;
      clearTimeout(wait);
    };
  });
  return {
    get all(): (T | null)[] {
      return items().map((i) => (i ? (results[playtestKey(i)] ?? null) : null));
    },
  };
}
