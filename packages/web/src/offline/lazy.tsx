// A screen that is fetched when it is first shown, and not before. Each kind of game's table is
// one (cards, boards, words, table sports, each arcade game), which is what lets someone keep
// some kinds on their device for playing offline and leave the others (offline/packs.ts).
//
// If the screen can't be fetched (no connection, and this kind of game isn't kept here), the
// person is told so in place of it, with a way back.
import type React from "react";
import { lazy, Suspense, type ComponentType } from "react";

/** In place of a screen that couldn't be fetched. */
function NotHere() {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <main className="table lazy-missing">
      <div className="sheet">
        <h2>{offline ? "This game isn't on this device" : "This game couldn't be loaded"}</h2>
        <p>
          {offline
            ? "You're offline, and this kind of game isn't one of those kept here. It needs a connection the first time. You can choose which games are kept under “Offline games” on the front page."
            : "Something got in the way of fetching it. Check the connection and try again."}
        </p>
        <div className="row">
          <button type="button" className="primary" onClick={() => location.reload()}>
            Try again
          </button>
          <button type="button" className="link" onClick={() => location.assign(location.pathname)}>
            Back to the games
          </button>
        </div>
      </div>
    </main>
  );
}

/** A component fetched on first use: `load` is its `import()`, picking the component out of the module. */
export function lazyScreen<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  const Inner = lazy(() => load().then((component) => ({ default: component }), () => ({ default: NotHere as ComponentType<P> })));
  return function Screen(props: P) {
    return (
      <Suspense fallback={<main className="table lazy-wait" aria-busy="true" />}>
        <Inner {...(props as P & React.JSX.IntrinsicAttributes)} />
      </Suspense>
    );
  };
}
