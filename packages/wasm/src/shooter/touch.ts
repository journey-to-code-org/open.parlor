// Touch controls: a thumb-stick wherever the left thumb lands, a swipe on the right to turn, and
// buttons to fire, use, change weapon, open the map and the menu.
//
// The same controls drive the menus, and say so: with a menu up the stick steps through it and the
// two big buttons read OK and Back; a question ("Are you sure?") makes them Yes and No.
import { type Screen, screenOf } from "./engine.ts";
import { KEY } from "./keys.ts";

export interface TouchTarget {
  key(pressed: boolean, key: number): void;
  /** Horizontal movement for the engine's mouse: positive turns right. */
  look(dx: number): void;
  state(): number;
}

export interface Touch {
  /** Called every frame: fits the buttons to what is on the screen. */
  update(): void;
  /** What the stick asks for now: forward up to 50, sideways up to 40 (the engine's running speeds). */
  move(): { forward: number; side: number };
  /** Lets go of everything (the game has stopped, or the page lost focus). */
  release(): void;
}

/** How far the stick travels, in CSS pixels. */
const REACH = 56;
/** Engine mouse units for each pixel swiped: a swipe across a phone turns you about half way round. */
const LOOK = 6;
/** Long enough for the engine to see a key go down in one tic and up in a later one. */
const TAP_MS = 90;

const el = (name: string, className: string, text = "") => {
  const node = document.createElement(name);
  node.className = className;
  node.textContent = text;
  return node;
};

export function createTouch(pad: HTMLElement, target: TouchTarget): Touch {
  const moveZone = el("div", "pad-zone pad-move");
  const lookZone = el("div", "pad-zone pad-look");
  const ring = el("div", "pad-ring");
  const knob = el("div", "pad-knob");
  ring.append(knob);
  ring.hidden = true;
  moveZone.append(ring);

  const button = (className: string, label: string, name: string) => {
    const node = el("button", `pad-button ${className}`, label) as HTMLButtonElement;
    node.type = "button";
    node.setAttribute("aria-label", name);
    return node;
  };
  const fire = button("pad-fire", "Fire", "Fire");
  const use = button("pad-use", "Use", "Use, or open a door");
  const menu = button("pad-small pad-menu", "Menu", "Menu");
  const map = button("pad-small pad-map", "Map", "Map");
  const previous = button("pad-small pad-prev", "‹", "Previous weapon");
  const next = button("pad-small pad-next", "›", "Next weapon");
  const top = el("div", "pad-top");
  top.append(menu, map, previous, next);
  pad.append(moveZone, lookZone, top, use, fire);

  const held = new Set<number>();
  const press = (key: number) => {
    if (!held.has(key)) target.key(true, key);
    held.add(key);
  };
  const lift = (key: number) => {
    if (held.delete(key)) target.key(false, key);
  };
  const tap = (key: number) => {
    press(key);
    setTimeout(() => lift(key), TAP_MS);
  };

  const screen = () => screenOf(target.state());
  const inMenu = () => screen() === "menu";
  const playing = () => screen() === "level";
  /**
   * True when a touch is not for the stick or a button: while the screen wipes the engine reads no
   * input (what is pressed then would all land at once after), and on a title screen or a demo
   * any touch brings up the menu.
   */
  const wake = () => {
    const now = screen();
    if (now === "title") tap(KEY.escape);
    return now === "title" || now === "wipe";
  };

  // The stick.
  let stick: { id: number; x: number; y: number } | null = null;
  let push = { x: 0, y: 0 };
  /** Which way the stick last stepped a menu, so one push is one step. */
  let stepped = "";
  moveZone.addEventListener("pointerdown", (event) => {
    if (wake()) return;
    // A new thumb takes the stick over: the last one's lift may never have been reported.
    dropStick();
    moveZone.setPointerCapture(event.pointerId);
    stick = { id: event.pointerId, x: event.clientX, y: event.clientY };
    const box = moveZone.getBoundingClientRect();
    ring.style.left = `${event.clientX - box.left}px`;
    ring.style.top = `${event.clientY - box.top}px`;
    knob.style.transform = "";
    ring.hidden = false;
  });
  moveZone.addEventListener("pointermove", (event) => {
    if (!stick || event.pointerId !== stick.id) return;
    let x = (event.clientX - stick.x) / REACH;
    let y = (event.clientY - stick.y) / REACH;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    push = { x, y };
    knob.style.transform = `translate(${x * REACH}px, ${y * REACH}px)`;
    if (!inMenu()) return;
    const way = Math.max(Math.abs(x), Math.abs(y)) < 0.5 ? "" : Math.abs(y) >= Math.abs(x) ? (y < 0 ? "up" : "down") : x < 0 ? "left" : "right";
    if (way && way !== stepped) tap(KEY[way]);
    stepped = way;
  });
  const dropStick = (event?: PointerEvent) => {
    if (event && (!stick || event.pointerId !== stick.id)) return;
    stick = null;
    push = { x: 0, y: 0 };
    stepped = "";
    ring.hidden = true;
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) moveZone.addEventListener(type, dropStick);

  // The swipe.
  let swipe: { id: number; x: number } | null = null;
  lookZone.addEventListener("pointerdown", (event) => {
    if (wake()) return;
    lookZone.setPointerCapture(event.pointerId);
    swipe = { id: event.pointerId, x: event.clientX };
  });
  lookZone.addEventListener("pointermove", (event) => {
    if (!swipe || event.pointerId !== swipe.id) return;
    if (playing()) target.look((event.clientX - swipe.x) * LOOK);
    swipe.x = event.clientX;
  });
  const dropSwipe = (event?: PointerEvent) => {
    if (!event || (swipe && event.pointerId === swipe.id)) swipe = null;
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) lookZone.addEventListener(type, dropSwipe);

  // The buttons. Fire is held; the rest are taps.
  const onPress = (node: HTMLElement, down: () => void, up?: () => void) => {
    node.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      node.setPointerCapture(event.pointerId);
      node.classList.add("pad-held");
      down();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      node.addEventListener(type, () => {
        node.classList.remove("pad-held");
        up?.();
      });
  };
  onPress(
    fire,
    () => {
      if (wake()) return;
      if (screen() === "question") tap(KEY.yes);
      else if (inMenu()) tap(KEY.enter);
      else press(KEY.fire);
    },
    () => lift(KEY.fire),
  );
  onPress(use, () => {
    if (wake()) return;
    if (screen() === "question") tap("n".charCodeAt(0));
    else tap(inMenu() ? KEY.backspace : KEY.use);
  });
  onPress(menu, () => wake() || tap(KEY.escape));
  onPress(map, () => playing() && tap(KEY.tab));
  onPress(previous, () => playing() && tap(KEY.previousWeapon));
  onPress(next, () => playing() && tap(KEY.nextWeapon));

  // A long press shouldn't offer to copy or save anything.
  pad.addEventListener("contextmenu", (event) => event.preventDefault());

  /** What the two big buttons do on each screen; the map and weapon buttons are only for a level. */
  const LABELS: Record<Screen, [fire: string, use: string]> = { level: ["Fire", "Use"], menu: ["OK", "Back"], question: ["Yes", "No"], title: ["Start", ""], wipe: ["", ""] };
  let shown: Screen | null = null;

  return {
    update() {
      const now = screen();
      // A wipe is over in a moment: the buttons keep what they said.
      if (now === shown || now === "wipe") return;
      shown = now;
      fire.textContent = LABELS[now][0];
      use.textContent = LABELS[now][1];
      use.hidden = now === "title";
      for (const node of [map, previous, next]) node.hidden = now !== "level";
    },
    // Up on the screen is a smaller y; with a menu up the stick steps instead of moving.
    move: () => (playing() ? { forward: Math.round(-push.y * 50), side: Math.round(push.x * 40) } : { forward: 0, side: 0 }),
    release() {
      for (const key of [...held]) lift(key);
      dropStick();
      dropSwipe();
    },
  };
}
