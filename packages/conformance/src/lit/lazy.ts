// Loaded when asked for, with a Zubra component the page hasn't used until then.
import { LitElement, html } from "lit";
import "@open-parlor/ui/zubra-ui/range-slider.zb";

class FeatureLazy extends LitElement {
  static override properties = { level: { state: true } };
  declare level: number;

  constructor() {
    super();
    this.level = 50;
  }

  override render() {
    return html`
      <range-slider data-t="f-lazy" .label=${"Late"} .value=${this.level} @valuechange=${(e: CustomEvent<number>) => (this.level = e.detail)}></range-slider>
      <output data-t="f-lazy-out">${this.level}</output>
    `;
  }
}
customElements.define("f-lazy", FeatureLazy);
