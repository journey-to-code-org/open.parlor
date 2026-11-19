// The first page a newcomer sees: what the parlor is, and what to call them. It's shown once, on the
// front page, to a browser that has no name saved and has never opened a game, and then never again.
//
// Plain DOM, no framework: the rest of the parlor is React, Vue, Svelte and Solid, and this is the
// one place its Zubra components are used as they are anywhere else, as custom elements. Importing a
// component with `?element` defines its tag; after that it's `document.createElement("text-field")`,
// properties in and DOM events out, like any element the browser has.
import "@open-parlor/ui/zubra-ui/text-field.zb?element";
import "@open-parlor/ui/zubra-ui/action-button.zb?element";
import { loadName, saveName } from "../storage";
import "./splash.css";

/** Kept once the intro is done or skipped, so it's never shown to this browser again. */
export const INTRO_KEY = "parlor.intro";
/** Set by the front page once this browser has opened a game (home/GameChooser.vue). */
const STARTED_KEY = "parlor.started";

/** The parts of a text-field and an action-button this page sets: their properties, as the elements take them. */
type TextFieldElement = HTMLElement & { label: string; description: string; value: string; name: string; placeholder: string; autocomplete: string; maxlength: number | null };
type ActionButtonElement = HTMLElement & { variant: string; size: string; type: string };

/**
 * Whether to introduce the parlor: on the front page itself (not a game, house or invite link), to a
 * browser that has never been named here or opened a game. A browser that can't keep anything
 * (storage refused) isn't shown it, since it would be shown it on every visit.
 */
export function wantsIntro(): boolean {
  if (location.search || location.hash) return false;
  const home = import.meta.env.BASE_URL;
  if (location.pathname !== home && location.pathname !== `${home}index.html`) return false;
  try {
    return !loadName() && localStorage.getItem(STARTED_KEY) !== "1" && localStorage.getItem(INTRO_KEY) !== "seen";
  } catch {
    return false;
  }
}

function remember() {
  try {
    localStorage.setItem(INTRO_KEY, "seen");
  } catch {
    /* it'll be shown again next time, which is harmless */
  }
}

/** One element, with its class and text. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** What the parlor is, in three lines: an emoji and a few words each. */
const POINTS: [string, string][] = [
  ["🃏", "Cards, chess, dice, word games, mini golf and arcade"],
  ["👪", "Around one phone, at a family table, or online with friends"],
  ["🎁", "Free, no sign-up, and it keeps working offline"],
];

/**
 * Show the intro over an empty page and resolve once it's done: with a name saved if one was typed,
 * or none if it was skipped. The front page is drawn after, so it greets them by that name.
 */
export function introduce(): Promise<void> {
  return new Promise((done) => {
    const page = el("main", "splash");
    page.setAttribute("aria-labelledby", "splash-title");

    const card = el("div", "splash-card");
    const suits = el("div", "splash-suits", "♠︎ ♥︎ ♣︎ ♦︎");
    suits.setAttribute("aria-hidden", "true");
    const title = el("h1", "splash-title", "open.parlor");
    title.id = "splash-title";
    const lead = el("p", "splash-lead", "A parlor full of games to play with the people you like.");

    const points = el("ul", "splash-points");
    for (const [emoji, words] of POINTS) {
      const item = el("li", "");
      const mark = el("span", "splash-emoji", emoji);
      mark.setAttribute("aria-hidden", "true");
      item.append(mark, el("span", "", words));
      points.append(item);
    }

    // A form, so Enter in the field is the same as "Let's play".
    const form = el("form", "splash-form");
    form.noValidate = true;
    const field = document.createElement("text-field") as TextFieldElement;
    field.label = "What should we call you?";
    field.description = "It's how you'll show up at the table. You can change it any time.";
    field.name = "name";
    field.placeholder = "Your name";
    field.autocomplete = "given-name";
    field.maxlength = 24;
    let name = "";
    field.addEventListener("valuechange", (event) => {
      name = (event as CustomEvent<string>).detail;
    });

    const actions = el("div", "splash-actions");
    const play = document.createElement("action-button") as ActionButtonElement;
    play.type = "submit";
    play.variant = "primary";
    play.size = "lg";
    play.textContent = "Let's play";
    const skip = document.createElement("action-button") as ActionButtonElement;
    skip.variant = "link";
    skip.textContent = "Skip for now";
    actions.append(play, skip);
    form.append(field, actions);

    card.append(suits, title, lead, points, form);
    page.append(card);
    document.body.append(page);

    let finished = false;
    function finish(keep: boolean) {
      if (finished) return;
      finished = true;
      if (keep) saveName(name);
      remember();
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      page.classList.add("leaving");
      // Drawn underneath while it fades, so the front page is there as it goes.
      done();
      setTimeout(() => page.remove(), reduce ? 0 : 320);
    }
    // "Let's play" with no name typed is fine: they're still in, just nameless for now.
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(true);
    });
    // The button's own <button> is inside its element; a click on it sends the form either way.
    play.addEventListener("click", (event) => {
      event.preventDefault();
      finish(true);
    });
    skip.addEventListener("click", () => finish(false));
  });
}
