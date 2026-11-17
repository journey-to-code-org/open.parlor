// The game on a page: a canvas the engine draws to, the keyboard, mouse, touch and controller that
// drive it, its sounds, and the screens around it (the invitation to start, the download, the end).
//
// mountShooter is all another app needs to put the game on a page of its own.
import { asset } from "../../host/assets.ts";
import { store } from "../../host/store.ts";
import { createAudio } from "./audio.ts";
import { type Engine, screenOf, startEngine } from "./engine.ts";
import { createGamepad } from "./gamepad.ts";
import { engineKey } from "./keys.ts";
import { createTouch } from "./touch.ts";

export interface ShooterOptions {
  /** Where the engine's .wasm file is. */
  wasm: string;
  /** The game's data: the address of a WAD (gzipped, if it ends in .gz), the name the engine opens it by, and the size of the download for the invitation. */
  wad: { url: string; name: string; megabytes: number };
  /** What the game is called on its start screen. */
  title: string;
  /** A line under the title. */
  blurb: string;
  /** Added to the engine's command line. */
  args?: string[];
}

const WIDTH = 320;
const HEIGHT = 200;
/** Engine mouse units for each pixel the mouse moves. */
const MOUSE = 4;
/** Keys the browser keeps: reload, full screen, the developer tools. */
const BROWSERS = new Set(["F5", "F11", "F12"]);

function el<K extends keyof HTMLElementTagNameMap>(name: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  node.className = className;
  node.textContent = text;
  return node;
}

export function mountShooter(root: HTMLElement, options: ShooterOptions): void {
  const screen = el("div", "shooter-screen");
  const canvas = el("canvas", "shooter-canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", options.title);
  const pad = el("div", "pad");
  pad.hidden = true;
  const card = el("div", "shooter-card");
  screen.append(canvas);
  root.classList.add("shooter");
  root.append(screen, pad, card);

  const context = canvas.getContext("2d", { alpha: false })!;
  const image = context.createImageData(WIDTH, HEIGHT);
  const kept = store("shooter");
  const touchScreen = matchMedia("(pointer: coarse)").matches;
  let engine: Engine | null = null;
  let module: Promise<WebAssembly.Module> | null = null;

  /** The screens around the game: a heading, a line or two, and at most one thing to do. */
  function show(heading: string, lines: string[], action?: { label: string; run: () => void }) {
    card.replaceChildren(el("h1", "", heading), ...lines.map((line) => el("p", "", line)));
    if (action) {
      const button = el("button", "shooter-go", action.label);
      button.type = "button";
      button.addEventListener("click", action.run);
      card.append(button);
      button.focus();
    }
    card.hidden = false;
  }

  // The game's clock stops while the tab is hidden, so coming back isn't a burst of missed time.
  let hiddenAt: number | null = document.hidden ? performance.now() : null;
  let lost = 0;
  const clockStart = performance.now();
  const now = () => (hiddenAt ?? performance.now()) - clockStart - lost;

  const audio = createAudio();
  const target = {
    key: (pressed: boolean, key: number) => engine?.key(pressed, key),
    state: () => engine?.state() ?? 0,
  };
  const playing = () => screenOf(target.state()) === "level";
  let buttons = 0;
  const touch = createTouch(pad, { ...target, look: (dx) => engine?.mouse(buttons, dx, 0) });
  const gamepad = createGamepad(target);

  /** Keyboard keys held, by the engine key each sent down. */
  const held = new Map<string, number>();
  function releaseAll() {
    for (const key of held.values()) engine?.key(false, key);
    held.clear();
    buttons = 0;
    engine?.mouse(0, 0, 0);
    touch.release();
  }

  addEventListener("keydown", (event) => {
    if (!engine || engine.stopped || BROWSERS.has(event.code) || event.metaKey) return;
    const key = engineKey(event.code, playing());
    if (!key) return;
    event.preventDefault();
    audio.unlock();
    if (event.repeat || held.has(event.code)) return;
    held.set(event.code, key);
    engine.key(true, key);
  });
  addEventListener("keyup", (event) => {
    const key = held.get(event.code);
    if (key === undefined) return;
    held.delete(event.code);
    engine?.key(false, key);
  });
  addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt ??= performance.now();
      releaseAll();
    } else if (hiddenAt !== null) {
      lost += performance.now() - hiddenAt;
      hiddenAt = null;
    }
  });

  // A mouse turns once the page has it to itself (a click on the picture); its buttons fire.
  canvas.addEventListener("click", () => {
    audio.unlock();
    if (!touchScreen && engine && !engine.stopped) void Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
  });
  const locked = () => document.pointerLockElement === canvas;
  document.addEventListener("mousemove", (event) => {
    if (locked()) engine?.mouse(buttons, playing() ? event.movementX * MOUSE : 0, 0);
  });
  for (const type of ["mousedown", "mouseup"] as const)
    document.addEventListener(type, (event) => {
      if (!locked() || event.button > 2) return;
      const bit = [1, 4, 2][event.button]!;
      buttons = type === "mousedown" ? buttons | bit : buttons & ~bit;
      engine?.mouse(buttons, 0, 0);
    });
  document.addEventListener("pointerlockchange", () => {
    if (!locked()) releaseAll();
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  addEventListener("touchstart", () => (pad.hidden = !engine || !!engine.stopped), { once: true, passive: true });

  function loop() {
    if (!engine) return;
    const stick = touch.move();
    const sticks = gamepad.poll();
    engine.analog(stick.forward + sticks.forward, stick.side + sticks.side, sticks.turn);
    if (engine.frame()) {
      touch.update();
      // What is on the screen, for styles (and for tests, which can't see into a canvas).
      const screen = screenOf(engine.state());
      if (root.dataset.screen !== screen) root.dataset.screen = screen;
      return void requestAnimationFrame(loop);
    }
    delete root.dataset.screen;
    // The engine has stopped: the player quit from its menu, or it failed.
    const { code, message } = engine.stopped!;
    engine = null;
    pad.hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
    if (code === 0) show("Thanks for playing", [], { label: "Play again", run: start });
    else show("The game stopped", [message || "Something went wrong inside the engine."], { label: "Start again", run: start });
  }

  async function start() {
    audio.unlock();
    try {
      show("Getting the game ready", ["Starting…"]);
      const status = card.querySelector("p")!;
      // Compiled as it streams in, where the server says it is WebAssembly; from the whole file where it doesn't.
      module ??= WebAssembly.compileStreaming(fetch(options.wasm)).catch(async () => WebAssembly.compile(await (await fetch(options.wasm)).arrayBuffer()));
      const [compiled, wad, files] = await Promise.all([
        module,
        asset(options.wad.url, {
          progress(received, total) {
            const megabytes = (received / 1048576).toFixed(0);
            status.textContent = total ? `Downloading the game: ${megabytes} of ${(total / 1048576).toFixed(0)} MB` : `Downloading the game: ${megabytes} MB`;
          },
          // A WAD begins with the letters IWAD or PWAD.
          valid: (bytes) => /^[IP]WAD$/.test(String.fromCharCode(...bytes.subarray(0, 4))),
        }),
        kept.load(),
      ]);
      files.set(options.wad.name, wad);
      status.textContent = "Starting…";
      engine = await startEngine(
        compiled,
        files,
        options.wad.name,
        {
          frame(pixels) {
            image.data.set(pixels);
            context.putImageData(image, 0, 0);
          },
          sound: audio,
          now,
          // The engine's own chatter is for the console; what it writes is kept for next time.
          log: (line) => console.debug(line),
          written: kept.save,
          removed: kept.remove,
        },
        options.args,
      );
      card.hidden = true;
      pad.hidden = !touchScreen;
      requestAnimationFrame(loop);
    } catch (error) {
      module = null;
      show("The game couldn't start", [navigator.onLine ? String(error instanceof Error ? error.message : error) : "There is no connection, and the game hasn't been downloaded to this device yet."], { label: "Try again", run: start });
    }
  }

  show(options.title, [options.blurb, `The first time, it downloads about ${options.wad.megabytes} MB and keeps it on this device.`], { label: "Play", run: start });
}
