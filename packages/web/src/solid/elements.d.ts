// The Zubra components the Solid islands use, as Solid's JSX sees them: custom elements whose
// properties are set with `prop:`.
import "solid-js";

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "bar-chart": Record<string, unknown>;
      "number-ticker": Record<string, unknown>;
      "status-badge": Record<string, unknown> & { children?: Element };
      "user-avatar": Record<string, unknown>;
      "text-field": Record<string, unknown>;
    }
  }
}
