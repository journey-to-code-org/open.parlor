// The engine, running: the .wasm module instantiated against the page, and the handful of calls
// the page makes into it. Nothing here touches the DOM, so the same code boots the engine in Node
// for the tests.
import { Exit, wasi } from "../../host/wasi.ts";
import type { Settings, Tic } from "../../net/protocol.ts";

/** Where the engine's picture, sound and messages go. */
export interface EngineHost {
  /** A finished frame: width x height pixels of red, green, blue, 255. Only valid during the call. */
  frame(pixels: Uint8ClampedArray, width: number, height: number): void;
  sound?: SoundHost;
  title?(title: string): void;
  /** In a game with other devices: this device's command for a tic, to send them. */
  command?(tic: number, command: Uint8Array): void;
  /** Milliseconds on the game's clock. The page's stops while the tab is hidden; by default it never does. */
  now?(): number;
  /** A line the engine printed. */
  log?(line: string): void;
  /** A file the engine wrote (its settings, a saved game). */
  written?(path: string, bytes: Uint8Array): void;
  removed?(path: string): void;
}

/** Sound effects. Volume is 0 to 127; separation is 0 (left) to 254 (right). */
export interface SoundHost {
  /** `lump` names the effect: the same number always carries the same `data` (a DMX sound lump). */
  start(channel: number, lump: number, data: () => Uint8Array, volume: number, separation: number): void;
  update(channel: number, volume: number, separation: number): void;
  stop(channel: number): void;
  playing(channel: number): boolean;
}

/** A menu is up. */
export const STATE_MENU = 1;
/** A game of the player's own is on: a level, or the screens between levels. Not the title screens, not a demo. */
export const STATE_LEVEL = 2;
/** The map is up. */
export const STATE_MAP = 4;
export const STATE_PAUSED = 8;
/** A question is up that wants a yes or a no ("Are you sure you want to quit?"). */
export const STATE_QUESTION = 16;
/** The engine reads no input for now: the screen is wiping from one thing to the next, or it has only just started. */
export const STATE_WIPING = 32;
/** The game is over, and its ending is on the screen. */
export const STATE_ENDING = 64;

/** The state as the one thing the player is looking at. */
export type Screen = "title" | "menu" | "question" | "level" | "wipe";
export function screenOf(state: number): Screen {
  if (state & STATE_WIPING) return "wipe";
  if (state & STATE_QUESTION) return "question";
  if (state & STATE_MENU) return "menu";
  return state & STATE_LEVEL ? "level" : "title";
}

export interface Engine {
  /** Runs the game tics that have come due and draws. False once the engine has stopped. */
  frame(): boolean;
  /** A key from keys.ts going down or up. */
  key(pressed: boolean, key: number): void;
  /** Mouse buttons held (bit 0 left, 1 right, 2 middle) and movement since the last call; movement adds up until the engine's next tic. */
  mouse(buttons: number, dx: number, dy: number): void;
  /** A thumb-stick, held until the next call: forward and side up to 50, turn in 65536ths of a circle a tic. */
  analog(forward: number, side: number, turn: number): void;
  /** What the player is looking at: see the STATE_ bits. */
  state(): number;
  /** In a game with other devices: the next tic, with every player's command. Tics are given in order from the first. */
  tic(tic: Tic): void;
  /** How many tics have been given and not run yet: more than a few is a device catching up. */
  behind(): number;
  /** How many tics the game has run. */
  tics(): number;
  /** Which players are in the game: bit 0 the first. */
  players(): number;
  /** For a device that watches: look through this player's eyes. */
  view(player: number): void;
  /** A number made from everything that moves: the same on every device that has run the same tics. */
  checksum(): number;
  /** Why the engine stopped, once it has: exit code 0 is the player quitting. */
  stopped: { code: number; message: string } | null;
}

interface Exports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  web_alloc(bytes: number): number;
  web_start(argc: number, argv: number): void;
  web_frame(): void;
  web_key(pressed: number, key: number): void;
  web_mouse(buttons: number, dx: number, dy: number): void;
  web_analog(forward: number, side: number, turn: number): void;
  web_state(): number;
  web_net_command_size(): number;
  web_net_tic(commands: number, playing: number): void;
  web_net_backlog(): number;
  web_tics(): number;
  web_players(): number;
  web_view(player: number): void;
  web_checksum(): number;
}

/** The engine keeps 128 tics that have arrived and not been run; it is given no more than this many at once. */
const BACKLOG = 100;

/** The command line for a game with other devices: the same on every device but for `slot`, its own player (-1 to watch). */
export function netArgs(settings: Settings, players: number, slot: number): string[] {
  return [
    ...["-net", String(players), String(slot)],
    ...["-skill", String(settings.skill)],
    ...["-warp", String(settings.episode), String(settings.map)],
    // Deathmatch where weapons stay and things come back, the kind most people mean.
    ...(settings.mode === "deathmatch" ? ["-altdeath"] : []),
    ...(settings.monsters ? [] : ["-nomonsters"]),
  ];
}

/**
 * Starts the engine on the WAD at `files.get(iwad)`. `args` are added to its command line
 * ("-warp", "1", "1" starts in the first map). Resolves once the first frame has been drawn.
 */
export async function startEngine(module: WebAssembly.Module, files: Map<string, Uint8Array>, iwad: string, host: EngineHost, args: string[] = []): Promise<Engine> {
  let exports!: Exports;
  const started = performance.now();
  const now = host.now ?? (() => performance.now() - started);
  const errors: string[] = [];
  const decoder = new TextDecoder();
  const memory = () => exports.memory;

  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi({
      files,
      memory,
      stdout: (line) => host.log?.(line),
      stderr: (line) => {
        errors.push(line);
        host.log?.(line);
      },
      written: host.written,
      removed: host.removed,
    }),
    host: {
      draw_frame: (at: number, width: number, height: number) => host.frame(new Uint8ClampedArray(memory().buffer, at, width * height * 4), width, height),
      now_ms: () => now() >>> 0,
      // A copy: the engine's memory is its own once the call returns.
      net_send: (tic: number, at: number, size: number) => host.command?.(tic, new Uint8Array(memory().buffer, at, size).slice()),
      set_title: (at: number, length: number) => host.title?.(decoder.decode(new Uint8Array(memory().buffer, at, length))),
      sound_start: (channel: number, lump: number, at: number, length: number, volume: number, separation: number) =>
        // A copy, taken only if the page hasn't this effect yet: the engine may reuse the memory.
        host.sound?.start(channel, lump, () => new Uint8Array(memory().buffer, at, length).slice(), volume, separation),
      sound_update: (channel: number, volume: number, separation: number) => host.sound?.update(channel, volume, separation),
      sound_stop: (channel: number) => host.sound?.stop(channel),
      sound_playing: (channel: number) => (host.sound?.playing(channel) ? 1 : 0),
    },
  });
  exports = instance.exports as unknown as Exports;

  /** Tics waiting for room in the engine, and the memory they are handed over in. */
  const waiting: Tic[] = [];
  let scratch = 0;

  const engine: Engine = {
    stopped: null,
    frame: () =>
      guarded(() => {
        // As many of the waiting tics as the engine has room for; it runs all it has been given.
        while (waiting.length > 0 && exports.web_net_backlog() < BACKLOG) {
          const next = waiting.shift()!;
          scratch ||= exports.web_alloc(next.commands.length);
          new Uint8Array(memory().buffer, scratch, next.commands.length).set(next.commands);
          exports.web_net_tic(scratch, next.playing);
        }
        exports.web_frame();
      }),
    tic: (tic) => void waiting.push(tic),
    behind: () => (engine.stopped ? 0 : waiting.length + exports.web_net_backlog()),
    tics: () => (engine.stopped ? 0 : exports.web_tics()),
    players: () => (engine.stopped ? 0 : exports.web_players()),
    view: (player) => void guarded(() => exports.web_view(player)),
    checksum: () => (engine.stopped ? 0 : exports.web_checksum() >>> 0),
    key: (pressed, key) => void guarded(() => exports.web_key(pressed ? 1 : 0, key)),
    mouse: (buttons, dx, dy) => void guarded(() => exports.web_mouse(buttons, dx, dy)),
    analog: (forward, side, turn) => void guarded(() => exports.web_analog(forward, side, turn)),
    state: () => (engine.stopped ? 0 : exports.web_state()),
  };

  /** Calls into the engine, unless it has stopped; notes it if this call is the one that stops it. */
  function guarded(call: () => void): boolean {
    if (engine.stopped) return false;
    try {
      call();
      return true;
    } catch (error) {
      // exit() unwinds as an Exit; anything else is a trap (the engine crashed).
      const code = error instanceof Exit ? error.code : -1;
      const message = error instanceof Exit ? errors.filter((line) => line.trim()).slice(-3).join("\n") : String(error);
      engine.stopped = { code, message };
      return false;
    }
  }

  // The command line, written into the engine's memory as main() would be given it.
  // -mb: the engine's own heap, in megabytes. Its default of 6 is tight for Freedoom's larger maps.
  const words = ["shooter", "-iwad", iwad, "-mb", "16", ...args];
  const encoder = new TextEncoder();
  guarded(() => {
    exports._initialize();
    const argv = exports.web_alloc(words.length * 4);
    words.forEach((word, i) => {
      const text = encoder.encode(word + "\0");
      const at = exports.web_alloc(text.length);
      new Uint8Array(memory().buffer, at, text.length).set(text);
      new DataView(memory().buffer).setUint32(argv + i * 4, at, true);
    });
    exports.web_start(words.length, argv);
  });
  return engine;
}
