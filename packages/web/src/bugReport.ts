// "Report a problem" and "Ask for a game": the page's side of @journey-to-code/relay. The relay does
// the gathering and the sending (see its client); the parlor adds where the player is, in its own
// words, and says how its sheets are dressed.
//
// Gathered without asking, because none of it says who you are: which screen and game you were on,
// when this copy of the page was built, and the last few errors the page logged. Gathered only if
// you say yes to each: a picture of the screen, and your browser's details.
import { createReportFlow } from "@journey-to-code/relay-ui";
import type { Classes } from "@journey-to-code/relay-ui/react";
import { createRelayClient } from "@journey-to-code/relay/client";

declare const __BUILT__: string;

/** The server's relay is mounted at /bugs. */
export const relay = createRelayClient({ base: "/bugs", built: typeof __BUILT__ === "string" ? __BUILT__ : "" });

/**
 * The screenshot walks the page with `firstChild`, but every Zubra component (the cards, the seats)
 * answers `firstChild` with only the content a page slotted into it, which is none, so each one
 * is drawn empty. While the picture is taken, give those elements back the real `firstChild`.
 * Nothing else is touched, and the components get their own back as soon as it's done.
 */
const takePicture = relay.takeScreenshot;
relay.takeScreenshot = async () => {
  const covered: Array<[Element, PropertyDescriptor]> = [];
  for (const el of document.body.querySelectorAll("*")) {
    const own = Object.getOwnPropertyDescriptor(el, "firstChild");
    if (own?.configurable) {
      covered.push([el, own]);
      delete (el as { firstChild?: unknown }).firstChild;
    }
  }
  try {
    return await takePicture();
  } finally {
    for (const [el, own] of covered) Object.defineProperty(el, "firstChild", own);
  }
};
/** The report sheet's state: closed, writing, looking it over, sent. */
export const reportFlow = createReportFlow(relay);

/** Which of the parlor's own styles dress each part of the relay's sheets. */
export const sheetClasses: Partial<Classes> = {
  backdrop: "sheet-backdrop report-backdrop",
  sheet: "sheet report-sheet",
  form: "report-form",
  field: "report-words",
  choice: "report-choice",
  choices: "tidy-choices",
  shot: "report-shot",
  details: "report-details",
  pre: "pre",
  error: "error",
  fine: "fine",
  tidyNote: "tidy-note",
  actions: "report-actions",
  primary: "primary",
  secondary: "secondary",
  link: "link",
};

// ---- Where the player is -------------------------------------------------------------------------

export interface BugContext {
  /** The screen, in a word or two: "home", "table", "practice table"… */
  screen: string;
  game?: string;
  /** A table on the server. It stays between the page and the server; an issue never shows it. */
  table?: string;
}
/** The app says where it is as it moves between screens. */
export const setBugContext = ({ screen, game, table }: BugContext) => relay.setContext({ screen, scope: game, ref: table });

/** Remember the last few errors the page logged, in case the player reports a problem. */
export const watchForErrors = () => void relay.watchForErrors();
/** Note a problem by hand (the screen that crashed, say). */
export const noteError = relay.noteError;

/** Whether this parlor takes reports and requests (false on a copy of the app with no server). */
export const bugs = { enabled: relay.enabled, canTidy: relay.canTidy };

/** Open the report sheet from anywhere (the screen shown when the app crashes, say). */
export const openReport = () => void reportFlow.open();
