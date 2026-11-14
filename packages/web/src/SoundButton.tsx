import { useDragPlace } from "./useDragPlace";

/** The table's sound switch. Like the chat and the ⚙︎, it can be dragged to wherever suits the player. */
export function SoundButton({ on, toggle, inline = false }: { on: boolean; toggle: () => void; inline?: boolean }) {
  const drag = useDragPlace<HTMLButtonElement>("sound");
  return drag.lift(
    <button
      type="button"
      ref={drag.target}
      className={`sound-toggle movable ${inline ? "inline" : ""} ${drag.moved ? "moved" : ""}`}
      style={drag.style}
      {...drag.handle}
      onClick={() => !drag.wasDrag() && toggle()}
      aria-pressed={on}
      aria-label={on ? "Turn sounds off" : "Turn sounds on"}
      title="Sounds (drag to move)"
    >
      {on ? "🔊" : "🔇"}
    </button>,
  );
}
