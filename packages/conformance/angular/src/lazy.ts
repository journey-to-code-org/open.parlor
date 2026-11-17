// Loaded when asked for (@defer in features.ts), with a Zubra component the page hasn't used
// until then.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, signal } from "@angular/core";
import "../zubra/zubra-ui/range-slider.js";

@Component({
  selector: "app-lazy",
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <range-slider data-t="f-lazy" label="Late" [value]="level()" (valuechange)="level.set(detail($event))"></range-slider>
    <output data-t="f-lazy-out">{{ level() }}</output>
  `,
})
export class Lazy {
  protected readonly level = signal(50);

  protected detail(event: Event): number {
    return (event as CustomEvent<number>).detail;
  }
}
