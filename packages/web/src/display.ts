// How the table looks on this device: how much things move, the suit colours, and whether a table
// sport is seen from an angle or from straight above. Kept in this
// browser and put on <html> as data attributes, so the CSS (and the card motion) follow them.

export type Motion = "on" | "calm" | "off";
export interface DisplaySettings {
  motion: Motion;
  /** 4: diamonds blue and clubs green, so every suit has its own colour. */
  suits: 2 | 4;
  /** How a table sport is looked at: down from an angle, like a model on a table, or from straight above, like a plan. */
  view: TableView;
}
export type TableView = "angled" | "above";

const KEY = "cardroom:display";
export const DEFAULT_DISPLAY: DisplaySettings = { motion: "on", suits: 2, view: "angled" };

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
