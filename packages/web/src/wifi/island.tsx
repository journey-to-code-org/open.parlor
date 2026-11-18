// A Solid island in this React app: React keeps an element, and the island is drawn into it when
// it mounts and taken away when it unmounts. The island's props are given once; the islands here
// follow a session (wifi/hosting.ts, wifi/joining.ts) for what changes, and call back through
// `latest` so the handlers React gives on each render reach them.
import { useEffect, useRef } from "react";

export function SolidIsland<P extends object>({ mount, props, className }: { mount: (into: HTMLElement, props: P) => () => void; props: P; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    // Functions are passed as ones that call whichever the latest render gave.
    const given = Object.fromEntries(Object.entries(latest.current).map(([key, value]) => [key, typeof value === "function" ? (...args: unknown[]) => (latest.current as Record<string, (...a: unknown[]) => unknown>)[key]!(...args) : value])) as P;
    return mount(host.current!, given);
  }, [mount]);
  return <div ref={host} className={className ?? "solid-island"} />;
}

/**
 * A Solid island whose props change with React's: `mount` returns `update`, which is handed the
 * props on every render after the first.
 */
export function LiveSolidIsland<P extends object>({ mount, props, className }: { mount: (into: HTMLElement, props: P) => { update: (props: P) => void; dispose: () => void }; props: P; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const island = useRef<{ update: (props: P) => void; dispose: () => void } | null>(null);
  useEffect(() => {
    island.current = mount(host.current!, props);
    return () => {
      island.current?.dispose();
      island.current = null;
    };
    // Mounted once; the effect below hands it each render's props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mount]);
  useEffect(() => {
    island.current?.update(props);
  });
  return <div ref={host} className={className ?? "solid-island"} />;
}
