// Each framework's own features, used around Zubra components: forms, transitions, keyed lists,
// context, portals, lazy loading. conformance.spec.ts checks that the components behave the same
// everywhere; these check that what a framework adds on top still works when the thing it is
// added to is a Zubra component.
//
// A check names the frameworks that have the feature. The pages (Features.vue, features.tsx,
// Features.svelte, angular/src/features.ts) use the same `data-t` names, all starting `f-`.
//
// KNOWN is as in conformance.spec.ts: { [check's title]: the Zubra issue it was reported in }.
// A listed check is expected to fail; when Zubra fixes it the run says so and the entry goes.
import { expect, test, type Page } from "@playwright/test";

const FRAMEWORKS = ["react", "vue", "svelte", "solid", "angular"] as const;
type Framework = (typeof FRAMEWORKS)[number];

const SWITCH_OFF = "a disabled reactive form disables a control that has no disabled prop of its own";

const KNOWN: Partial<Record<Framework, Record<string, string>>> = {
  // zubraModel puts `disabled` on the element, and the browser tells a form-associated element so,
  // but zubra-ui's toggle-switch does nothing with it: its button can still be pressed. The same
  // would show in plain HTML inside <fieldset disabled>. Not reported upstream yet.
  angular: { [SWITCH_OFF]: "zubra-ui: toggle-switch has no disabled state (to be reported)" },
};

const t = (page: Page, name: string) => page.locator(`[data-t="${name}"]`);

interface Feature {
  title: string;
  /** What the feature is called in each framework that has it. */
  in: Partial<Record<Framework, string>>;
  body: (page: Page, framework: Framework) => Promise<void>;
}

const FEATURES: Feature[] = [
  {
    title: "a keyed list reordered in a slot keeps its elements",
    in: { react: "key", vue: "TransitionGroup", svelte: "keyed each with animate:flip", solid: "For", angular: "@for with track" },
    body: async (page) => {
      const items = t(page, "f-order").locator(".stack").locator("[data-f-item]");
      await expect(items).toHaveText(["ace", "king", "queen"]);
      await items.first().evaluate((element) => ((element as HTMLElement & { marked?: boolean }).marked = true));
      await t(page, "f-reverse").click();
      await expect(items).toHaveText(["queen", "king", "ace"]);
      // The same element moved; it wasn't thrown away and drawn again.
      expect(await items.last().evaluate((element) => (element as HTMLElement & { marked?: boolean }).marked)).toBe(true);
      await expect(items.last().locator("span").first()).toHaveClass(/badge-neutral/);
    },
  },
  {
    title: "the page's own component in a slot still gets the page's context",
    in: { react: "context", vue: "provide / inject", svelte: "setContext", solid: "context", angular: "dependency injection" },
    body: async (page) => {
      const word = t(page, "f-ctx-home").locator(".empty-text").locator('[data-t="f-ctx"]');
      await expect(word).toHaveText("hello");
      await t(page, "f-ctx-set").click();
      await expect(word).toHaveText("howdy");
    },
  },
  {
    title: "class and style bindings land on the component and leave its own alone",
    in: { react: "className and style", vue: ":class and :style", svelte: "class: and style:", solid: "classList and style", angular: "[class.x] and [style.x]" },
    body: async (page) => {
      const badge = t(page, "f-styled");
      await expect(badge).not.toHaveClass(/f-hot/);
      await t(page, "f-style-toggle").click();
      await expect(badge).toHaveClass(/f-hot/);
      await expect(badge).toHaveCSS("opacity", "0.5");
      await expect(badge.locator("span").first()).toHaveClass(/badge-neutral/);
      await expect(badge).toHaveText("Styled");
      await t(page, "f-style-toggle").click();
      await expect(badge).not.toHaveClass(/f-hot/);
      await expect(badge).toHaveCSS("opacity", "1");
    },
  },
  {
    title: "a component drawn somewhere else on the page is still bound both ways",
    in: { react: "createPortal", vue: "Teleport", solid: "Portal" },
    body: async (page) => {
      await expect(t(page, "f-portal")).toHaveCount(1);
      await expect(t(page, "f-features").locator('[data-t="f-portal"]')).toHaveCount(0);
      const button = t(page, "f-portal").getByRole("switch");
      await button.click();
      await expect(t(page, "f-portal-out")).toHaveText("on");
      await t(page, "f-portal-off").click();
      await expect(button).toHaveAttribute("aria-checked", "false");
    },
  },
  {
    title: "a component that is loaded later arrives and works",
    in: { react: "lazy and Suspense", vue: "defineAsyncComponent", svelte: "#await import()", solid: "lazy and Suspense", angular: "@defer" },
    body: async (page) => {
      await expect(t(page, "f-lazy-wait")).toBeVisible();
      await expect(t(page, "f-lazy")).toHaveCount(0);
      await t(page, "f-lazy-load").click();
      const slider = t(page, "f-lazy").locator('input[type="range"]');
      await expect(slider).toHaveValue("50");
      await expect(t(page, "f-lazy-wait")).toHaveCount(0);
      await expect(t(page, "f-lazy").locator("label")).toHaveText("Late");
      await slider.fill("70");
      await expect(t(page, "f-lazy-out")).toHaveText("70");
    },
  },
  {
    title: "a component kept while it is off the page keeps what was typed",
    in: { react: "Activity", vue: "KeepAlive" },
    body: async (page) => {
      const input = t(page, "f-kept").locator("input");
      await input.fill("still here");
      await t(page, "f-keep-toggle").click();
      await expect(input).toBeHidden();
      await t(page, "f-keep-toggle").click();
      await expect(input).toBeVisible();
      await expect(input).toHaveValue("still here");
      await input.press("End");
      await input.type("!");
      await expect(input).toHaveValue("still here!");
    },
  },
  {
    title: "a component leaves with a transition and comes back whole",
    in: { vue: "Transition", svelte: "transition:fade", angular: "animate.leave" },
    body: async (page) => {
      const badge = t(page, "f-fade");
      await expect(badge).toBeVisible();
      await t(page, "f-fade-toggle").click();
      await expect(badge).toHaveCount(0);
      // The framework saw the transition through, rather than dropping the element at once.
      await expect(t(page, "f-fade-out")).toHaveText("1");
      await t(page, "f-fade-toggle").click();
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText("Fading");
      await expect(badge).toHaveCSS("opacity", "1");
      await expect(badge.locator("span").first()).toHaveClass(/badge-neutral/);
    },
  },
  {
    title: "props handed over as one object reach the component",
    in: { react: "spread", vue: "v-bind with an object", svelte: "spread", solid: "spread" },
    body: async (page) => {
      const badge = t(page, "f-spread").locator("span").first();
      await expect(badge).toHaveClass(/badge-neutral/);
      await expect(badge).toHaveClass(/badge-dot/);
      await t(page, "f-spread-next").click();
      await expect(badge).toHaveClass(/badge-success/);
      await expect(badge).toHaveClass(/badge-dot/);
    },
  },
  {
    title: "a reactive form's controls are bound both ways",
    in: { angular: "FormGroup and formControlName" },
    body: async (page) => {
      const out = t(page, "f-form-out");
      const input = t(page, "f-form-name").locator("input");
      const button = t(page, "f-form-sound").getByRole("switch");
      await expect(out).toHaveText('{"name":"","sound":false}');
      await input.fill("Dot");
      await expect(out).toHaveText('{"name":"Dot","sound":false}');
      await button.click();
      await expect(out).toHaveText('{"name":"Dot","sound":true}');
      await t(page, "f-form-set").click();
      await expect(input).toHaveValue("Hank");
      await expect(button).toHaveAttribute("aria-checked", "false");
      await expect(out).toHaveText('{"name":"Hank","sound":false}');
      await input.press("End");
      await input.type("!");
      await expect(out).toHaveText('{"name":"Hank!","sound":false}');
    },
  },
  {
    title: "a reactive form's validity and touched state follow the field",
    in: { angular: "Validators and ng-* classes" },
    body: async (page) => {
      const field = t(page, "f-form-name");
      const state = t(page, "f-form-state");
      await expect(state).toHaveText("invalid untouched pristine");
      await expect(field).toHaveClass(/ng-invalid/);
      await expect(field).toHaveClass(/ng-untouched/);
      await field.locator("input").fill("Dot");
      await expect(state).toHaveText("valid untouched dirty");
      await expect(field).toHaveClass(/ng-valid/);
      await expect(field).toHaveClass(/ng-dirty/);
      await field.locator("input").blur();
      await expect(state).toHaveText("valid touched dirty");
      await expect(field).toHaveClass(/ng-touched/);
      await field.locator("input").fill("");
      await expect(state).toHaveText("invalid touched dirty");
    },
  },
  {
    title: "disabling and resetting a reactive form reach the fields",
    in: { angular: "disable() and reset()" },
    body: async (page) => {
      const input = t(page, "f-form-name").locator("input");
      const button = t(page, "f-form-sound").getByRole("switch");
      await input.fill("Dot");
      await button.click();
      await t(page, "f-form-disable").click();
      await expect(input).toBeDisabled();
      await t(page, "f-form-disable").click();
      await expect(input).toBeEnabled();
      await t(page, "f-form-reset").click();
      await expect(input).toHaveValue("");
      await expect(button).toHaveAttribute("aria-checked", "false");
      await expect(t(page, "f-form-out")).toHaveText('{"name":"","sound":false}');
      await expect(t(page, "f-form-state")).toHaveText("invalid untouched pristine");
    },
  },
  {
    title: SWITCH_OFF,
    in: { angular: "disable()" },
    body: async (page) => {
      const button = t(page, "f-form-sound").getByRole("switch");
      await t(page, "f-form-disable").click();
      await expect(t(page, "f-form-name").locator("input")).toBeDisabled();
      await expect(button).toBeDisabled();
      await t(page, "f-form-disable").click();
      await expect(button).toBeEnabled();
    },
  },
  {
    title: "the page's own wrapper passes its content on to the component's slots",
    in: { angular: "ng-content" },
    body: async (page) => {
      const panel = t(page, "f-proj");
      await expect(panel.locator("h3")).toHaveText("Projected");
      await expect(panel.locator(".empty-text")).toHaveText("Inner text");
      const action = panel.locator(".empty-actions").locator('[data-t="f-proj-action"]');
      await action.getByRole("button").click();
      await expect(t(page, "f-proj-out")).toHaveText("1");
    },
  },
  {
    title: "a v-model modifier is applied to what the component reports",
    in: { vue: "v-model.trim" },
    body: async (page) => {
      await t(page, "f-trim").locator("input").fill("  Dot  ");
      await expect(t(page, "f-trim-out")).toHaveText("[Dot]");
    },
  },
  {
    title: "a component is hidden and shown without being taken away",
    in: { vue: "v-show" },
    body: async (page) => {
      const badge = t(page, "f-vshow");
      await expect(badge).toBeVisible();
      const display = await badge.evaluate((element) => getComputedStyle(element).display);
      await t(page, "f-vshow-toggle").click();
      await expect(badge).toBeHidden();
      await expect(badge).toHaveCount(1);
      await t(page, "f-vshow-toggle").click();
      await expect(badge).toBeVisible();
      // Its own display is back, not one the framework guessed.
      await expect(badge).toHaveCSS("display", display);
    },
  },
  {
    title: "an action on a component hears its events and lets go when it leaves",
    in: { svelte: "use:" },
    body: async (page) => {
      await t(page, "f-action").locator("input").fill("Lou");
      await expect(t(page, "f-action-out")).toHaveText("Lou");
      await expect(t(page, "f-action-live")).toHaveText("1");
      await t(page, "f-action-toggle").click();
      await expect(t(page, "f-action")).toHaveCount(0);
      await expect(t(page, "f-action-live")).toHaveText("0");
    },
  },
  {
    title: "a keyed block makes the component afresh",
    in: { svelte: "#key" },
    body: async (page) => {
      const button = t(page, "f-keyed").getByRole("switch");
      await button.click();
      await expect(button).toHaveAttribute("aria-checked", "true");
      await t(page, "f-key-next").click();
      await expect(button).toHaveAttribute("aria-checked", "false");
      await button.click();
      await expect(button).toHaveAttribute("aria-checked", "true");
    },
  },
  {
    title: "a snippet's elements go to the slots they name",
    in: { svelte: "#snippet and @render" },
    body: async (page) => {
      const home = t(page, "f-snip");
      await expect(home.locator(".empty-text")).toHaveText("Snippet text");
      const action = home.locator(".empty-actions").locator('[data-t="f-snip-action"]');
      await expect(action).toHaveText("Go");
      await action.getByRole("button").click();
      await expect(t(page, "f-snip-out")).toHaveText("1");
    },
  },
  {
    title: "a tag chosen at run time becomes that component",
    in: { solid: "Dynamic" },
    body: async (page) => {
      const dynamic = t(page, "f-dyn");
      await expect(dynamic.locator("span").first()).toHaveClass(/badge-/);
      await expect(dynamic).toHaveText("Dynamic");
      await t(page, "f-dyn-next").click();
      await expect(dynamic.getByRole("button", { name: "Dynamic" })).toBeVisible();
      await dynamic.getByRole("button").click();
      await expect(t(page, "f-dyn-out")).toHaveText("1");
    },
  },
];

for (const framework of FRAMEWORKS) {
  test.describe(framework, () => {
    let errors: string[];

    test.beforeEach(async ({ page }) => {
      errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      await page.goto(`/${framework}/`);
      await expect(t(page, "f-features")).toBeVisible();
    });

    for (const feature of FEATURES) {
      const name = feature.in[framework];
      if (!name) continue;
      test(`${feature.title} (${name})`, async ({ page }) => {
        const known = KNOWN[framework]?.[feature.title];
        test.fail(!!known, known);
        await feature.body(page, framework);
        expect(errors, "errors on the page").toEqual([]);
      });
    }
  });
}
