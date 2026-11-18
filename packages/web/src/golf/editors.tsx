// The course and lane editors are Svelte (CourseEditor.svelte, LaneEditor.svelte), inside this React
// app: each is mounted into an element React keeps, as the front page mounts its Vue chooser. Same
// props as before; the screen's key starts a new one for another course or lane.
import { mount, unmount, type Component } from "svelte";
import { useEffect, useRef } from "react";
import CourseEditorSvelte from "./CourseEditor.svelte";
import LaneEditorSvelte from "./LaneEditor.svelte";

type EditorProps<Play extends unknown[]> = {
  /** The course or lane to change, or "new". */
  id: string;
  onLeave: () => void;
  onPlay: (...play: Play) => void;
  /** Saved for the first time: the page's address should say which it is now. */
  onSaved: (id: string) => void;
};

function island<Play extends unknown[]>(editor: Component<{ id: string; onleave: () => void; onplay: (...play: Play) => void; onsaved: (id: string) => void }>) {
  return function Editor(props: EditorProps<Play>) {
    const host = useRef<HTMLDivElement>(null);
    // The handlers App gives are new on each render: the Svelte editor calls whichever is latest.
    const latest = useRef(props);
    latest.current = props;
    useEffect(() => {
      const app = mount(editor, {
        target: host.current!,
        props: {
          id: props.id,
          onleave: () => latest.current.onLeave(),
          onplay: (...play: Play) => latest.current.onPlay(...play),
          onsaved: (id: string) => latest.current.onSaved(id),
        },
      });
      return () => void unmount(app);
    }, [props.id]);
    return <div ref={host} className="svelte-island" />;
  };
}

export const CourseEditor = island<[course: string, holes: number]>(CourseEditorSvelte);
export const LaneEditor = island<[lane: string, name: string]>(LaneEditorSvelte);
