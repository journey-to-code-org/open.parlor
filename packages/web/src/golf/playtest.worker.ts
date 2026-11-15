// Plays a hole or a lane the editor is making, as the computer would, off the page's thread: a
// playtest takes a fraction of a second a hole, and painting shouldn't stutter while it runs.
import { playtestHole, playtestLane, type CustomHole, type CustomLane } from "@open-parlor/courses";

type Asked = { id: number; kind: "minigolf"; item: CustomHole } | { id: number; kind: "bowling"; item: CustomLane };
const scope = self as unknown as { onmessage: ((event: MessageEvent<Asked>) => void) | null; postMessage(message: unknown): void };

scope.onmessage = ({ data }) => {
  try {
    const result = data.kind === "bowling" ? playtestLane(data.item) : playtestHole(data.item);
    scope.postMessage({ id: data.id, result });
  } catch (e) {
    scope.postMessage({ id: data.id, error: (e as Error).message });
  }
};
