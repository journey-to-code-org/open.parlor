// A framework-free session (wifi/hosting.ts, wifi/joining.ts) as a Solid signal: read it in JSX and
// the screen follows it.
import { createSignal, onCleanup, type Accessor } from "solid-js";

export function follow<T>(session: { get(): T; subscribe(changed: () => void): () => void }): Accessor<T> {
  const [now, setNow] = createSignal(session.get(), { equals: false });
  onCleanup(session.subscribe(() => setNow(() => session.get())));
  return now;
}
