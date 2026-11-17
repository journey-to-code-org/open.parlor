# Zubra conformance

One fixture of Zubra components, written six times (plain elements, React, Vue, Svelte, Solid,
Angular), and one set of browser tests run against all six. A check that passes in five and fails
in the sixth is a difference in how the components behave in that framework.

```sh
npm run build -w @open-parlor/conformance        # the six pages
npm run conformance -w @open-parlor/conformance  # 18 checks × 6 frameworks, and each framework's own features, in Chrome
npm run dev -w @open-parlor/conformance          # http://localhost:4179/react/ and friends (not Angular)
```

## What's checked

Each page shows the same components, wired to the same buttons and outputs (`data-t` names), from
`src/shared/fixture.ts`:

| | Components |
| --- | --- |
| Props in: strings, numbers, booleans, lists, objects | `status-badge`, `segmented-control`, `data-table`, `playing-card`, `seat-badge` |
| Events out | `segmented-control`, `bid-pad`, `playing-card`, `action-button` |
| Two-way binding | `text-field`, `toggle-switch`, `modal-dialog`, `tab-list`, `data-table` |
| Slots: static text, text the page fills in, the page's own elements, named slots, elements that arrive and leave later, lists | `status-badge`, `empty-state`, `alert-banner`, `modal-dialog`, `stack-layout`, `tab-list` |
| Coming and going | `toggle-switch` taken off the page and put back |

Every check also fails if the page logged an error.

How each framework gets the components:

| Page | A `.zb` import is |
| --- | --- |
| `src/element` | the custom element, driven by DOM calls: the baseline |
| `src/react` | a React component (`@zubra/unplugin`) |
| `src/vue` | a Vue component (`@zubra/unplugin`) |
| `src/svelte` | the custom element; Svelte uses its tag |
| `src/solid` | the custom element (`?element`); JSX uses its tag with `prop:` and `on:` |
| `angular` | the custom element, compiled ahead by `zubra build --lib`; templates use its tag |

The pages are written the way each framework's templates naturally are, with no workarounds, so
the tests show what a newcomer would hit. They import the components loosely typed; the card
room's apps are where the typings Zubra writes are checked.

## Each framework's own features

`tests/features.spec.ts` is a second set of checks. The first set asks whether the components
behave the same everywhere; this one asks whether what a framework adds on top still works when
the thing it is added to is a Zubra component. Each page has a second part for it
(`Features.vue`, `features.tsx`, `Features.svelte`, `angular/src/features.ts`), with `data-t`
names that start `f-`. A check runs in the frameworks that have the feature:

| Check | React | Vue | Svelte | Solid | Angular |
| --- | --- | --- | --- | --- | --- |
| A keyed list reordered in a slot keeps its elements | `key` | `TransitionGroup` | keyed `each`, `animate:flip` | `For` | `@for` with `track` |
| The page's own component in a slot gets the page's context | context | provide / inject | `setContext` | context | dependency injection |
| Class and style bindings land on the component | `className`, `style` | `:class`, `:style` | `class:`, `style:` | `classList`, `style` | `[class.x]`, `[style.x]` |
| A component loaded later arrives and works | `lazy`, `Suspense` | `defineAsyncComponent` | `#await import()` | `lazy`, `Suspense` | `@defer` |
| A component drawn elsewhere on the page stays bound | `createPortal` | `Teleport` | | `Portal` | |
| Props handed over as one object | spread | `v-bind` | spread | spread | |
| A component leaves with a transition | | `Transition` | `transition:fade` | | `animate.leave` |
| A component kept off the page keeps what was typed | `Activity` | `KeepAlive` | | | |
| Forms | | `v-model.trim` | | | reactive forms: values both ways, validity and touched, `disable()`, `reset()`, over the text field, switch, select, segmented control and swatches |
| Only there | | `v-show` | `use:` actions, `#key`, snippets | `Dynamic` | `ng-content` in the page's own wrapper |

That is 45 checks: 7 in React, 10 in Vue, 9 in Svelte, 7 in Solid and 12 in Angular.

Not covered yet: Angular's router with lazy routes and template-driven `<form>` validation, Vue's
`Suspense` and template refs, Solid's stores and resources, server rendering and hydration in any
of them, and a native `<form>` submitting the components' values.

One thing learned writing the Solid page: Solid sets what it is given on a custom element as a
property, so a `data-` attribute with a value that isn't a plain string is written `attr:data-…`.
That is Solid's rule for every custom element, not a difference in Zubra.

## Known differences

None today: the 18 component checks pass in all six frameworks, and the 45 feature checks pass
in the frameworks that have each feature, on Zubra 5.15.0.

`KNOWN` in each spec is where a difference goes when one turns up: the check's title and the
Zubra issue it was reported in. A listed check is expected to fail, so the run stays
green. When Zubra fixes it, the check passes, the run goes red with "Expected to fail, but
passed", and the entry comes out (with any workaround in the parlor's apps).

The first run of this suite, on Zubra 5.9, found five (zubra#261, #262, #267, #268, #269) and a
gap in the typings (#270). All were fixed in 5.15.0, and the workarounds they needed are gone from
the admin app and the parlor.

The first run of the feature checks found one, in the components rather than in Zubra: a
disabled reactive form disabled `text-field` and `select-field` but left `toggle-switch`,
`color-swatches` and `segmented-control` usable, because they had no disabled state. The parlor's
copies have one now. Upstream it is zubra-ui#20 (the switch, fixed in zubra-ui#21) and zubra-ui#22
(the rest).

## Adding a check

Add what it needs to all six pages (same `data-t` names), then one `check(...)` in the spec. For a
framework's own feature, add it to that framework's features page and one entry to `FEATURES` in
`tests/features.spec.ts`, naming the frameworks that have it. If a
framework fails it, report it upstream and add it to `KNOWN` with the link.
