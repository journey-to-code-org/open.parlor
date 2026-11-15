// How the table looks on this device: how much things move, the suit colours, whether a table
// sport is seen from an angle or from straight above, and (on a board of crossings: Go) whether the
// coordinates are drawn and whether a stone takes one tap or two. Kept in this
// browser and put on <html> as data attributes, so the CSS (and the card motion) follow them.

export type Motion = "on" | "calm" | "off";
export interface DisplaySettings {
  motion: Motion;
  /** 4: diamonds blue and clubs green, so every suit has its own colour. */
  suits: 2 | 4;
  /** How a table sport is looked at: down from an angle, like a model on a table, or from straight above, like a plan. */
  view: TableView;
  /** Whether a table sport is drawn in 3-D (where the device can) or in the flat drawing it always had. */
  depth: Depth;
  /** A board's coordinates (A to T, 1 to 19) are drawn round it. */
  coords: boolean;
  /** How a stone is put down on a board of crossings. */
  placing: Placing;
}
export type TableView = "angled" | "above";
/** "auto": 3-D where it suits the game (bowling), the flat drawing where that is the better one (mini golf). */
export type Depth = "auto" | "3d" | "flat";
/**
 * "tap": a tap on a crossing plays there. "confirm": a tap puts a ghost stone there, to be nudged
 * and then played with a second tap. "auto": two taps only where a finger can't be trusted with
 * one, which is a touch screen with the crossings close together (the full board on a phone).
 */
export type Placing = "auto" | "confirm" | "tap";

const KEY = "cardroom:display";
export const DEFAULT_DISPLAY: DisplaySettings = { motion: "on", suits: 2, view: "angled", depth: "auto", coords: true, placing: "auto" };

export const PLACINGS: { id: Placing; label: string; hint: string }[] = [
  { id: "auto", label: "Two taps when the board is small", hint: "On a touch screen with the crossings close together, the first tap shows the stone and the second plays it. Otherwise one tap plays." },
  { id: "confirm", label: "Always two taps", hint: "The first tap shows the stone, where it can be nudged with the arrows. Tap it again, or press Play, to put it down." },
  { id: "tap", label: "One tap", hint: "A tap on a crossing plays there at once." },
];

export const MOTIONS: { id: Motion; label: string; hint: string }[] = [
  { id: "on", label: "On", hint: "Cards glide, tricks sweep, burns flare, winners get confetti." },
  { id: "calm", label: "Calm", hint: "Quicker, smaller movements. No confetti or pulsing." },
  { id: "off", label: "Off", hint: "Cards just appear where they go." },
];

export function loadDisplay(): DisplaySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<DisplaySettings>;
    return {
      motion: saved.motion === "calm" || saved.motion === "off" ? saved.motion : "on",
      suits: saved.suits === 4 ? 4 : 2,
      view: saved.view === "above" ? "above" : "angled",
      depth: saved.depth === "flat" || saved.depth === "3d" ? saved.depth : "auto",
      coords: saved.coords !== false,
      placing: saved.placing === "confirm" || saved.placing === "tap" ? saved.placing : "auto",
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

/** Put the settings on the page: <html data-motion="calm" data-suits="4" data-view="angled">. */
export function applyDisplay(settings: DisplaySettings = loadDisplay()) {
  const html = document.documentElement;
  html.dataset.motion = settings.motion;
  html.dataset.suits = String(settings.suits);
  html.dataset.view = settings.view;
  html.dataset.depth = settings.depth;
  html.dataset.coords = settings.coords ? "on" : "off";
  html.dataset.placing = settings.placing;
}

export function saveDisplay(settings: DisplaySettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* private mode: it still applies for now */
  }
  applyDisplay(settings);
}

/** The motion setting as it stands on the page. */
export const motionSetting = (): Motion => {
  const m = typeof document === "undefined" ? undefined : document.documentElement.dataset.motion;
  return m === "calm" || m === "off" ? m : "on";
};

/** How table sports are looked at, as it stands on the page. */
export const viewSetting = (): TableView => (typeof document !== "undefined" && document.documentElement.dataset.view === "above" ? "above" : "angled");

/** Whether table sports are drawn in 3-D, as it stands on the page. */
export const depthSetting = (): Depth => {
  const d = typeof document === "undefined" ? undefined : document.documentElement.dataset.depth;
  return d === "flat" || d === "3d" ? d : "auto";
};
/** Games whose flat, angled drawing is the better one, and so is what "auto" gives. */
const BEST_FLAT = new Set(["minigolf"]);
/** Is this game drawn in 3-D, going by the setting? */
export const wants3d = (game: string, depth: Depth = depthSetting()) => depth === "3d" || (depth === "auto" && !BEST_FLAT.has(game));

/** How stones are put down, as it stands on the page. */
export const placingSetting = (): Placing => {
  const p = typeof document === "undefined" ? undefined : document.documentElement.dataset.placing;
  return p === "confirm" || p === "tap" ? p : "auto";
};
