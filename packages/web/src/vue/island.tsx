// A Vue island inside the React app: mounted once, and handed new props after every React render,
// in place, so Vue redraws only what changed and nothing is made again.
import { useEffect, useRef } from "react";
import { createApp, h, shallowReactive, type Component } from "vue";

export function VueIsland<P extends Record<string, unknown>>({ component, props }: { component: Component; props: P }) {
  const el = useRef<HTMLDivElement>(null);
  const given = useRef(shallowReactive({ ...props }));
  useEffect(() => {
    Object.assign(given.current, props);
  });
  useEffect(() => {
    const app = createApp({ render: () => h(component, { ...given.current }) });
    app.mount(el.current!);
    return () => app.unmount();
  }, [component]);
  return <div ref={el} className="vue-island" />;
}
