// The game on a page: a canvas the engine draws to, the keyboard, mouse, touch and controller that
// drive it, its sounds, and the screens around it (the invitation to start, the download, the end).
//
// With a server that has rooms, it is also where people gather to play together or to watch: the
// host sets the game up, and every device starts the same game when the room says so.
//
// mountShooter is all another app needs to put the game on a page of its own.
import { asset } from "../../host/assets.ts";
import { store } from "../../host/store.ts";
import { createAudio } from "./audio.ts";
import type { Tic } from "../../net/protocol.ts";
import { type Engine, netArgs, screenOf, startEngine } from "./engine.ts";
import { createGamepad } from "./gamepad.ts";
import { engineKey } from "./keys.ts";
import { type Game, type Lobby, openSession, type Session } from "./session.ts";
import { connect, hasRooms, openRoom, showLobby } from "./together.ts";
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
  /** Added to the engine's command line when playing alone. */
  args?: string[];
  /** Where the server's rooms are (…/play), for playing with other devices. Left out, or not there, and the game is played alone. */
  rooms?: string;
  /** How many episodes the game has, and maps in each, for the host to choose where to start. */
  levels: { episodes: number; maps: number };
  /**
   * The player's own version of the game's data, when playing alone. A game with other devices is
   * played on the data as it came, so every device has the same.
   */
  own?: {
    /** Given the game's WAD, the WAD to play. */
    apply(wad: Uint8Array): Promise<Uint8Array>;
    /** A line for the start screen that says what is different about it, or "" if nothing is. */
    note(): Promise<string>;
  };
  /** Where the editor for the game's pictures and sounds is, for a link from the start screen. */
  editor?: string;
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

/** The game, once it is on a page. */
export interface Shooter {
  /** Takes the game off the page: stops it, leaves any room, and lets go of the keyboard and the mouse. */
  destroy(): void;
}

export function mountShooter(root: HTMLElement, options: ShooterOptions): Shooter {
  /** Ended by destroy(): every listener on the window and the document goes with it. */
  const ending = new AbortController();
  const life = { signal: ending.signal };
  const screen = el("div", "shooter-screen");
  const canvas = el("canvas", "shooter-canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", options.title);
  const pad = el("div", "pad");
  pad.hidden = true;
  const card = el("div", "shooter-card");
  /** Over the picture in a game with other devices: who it is waiting for, whose eyes a watcher has, the way out. */
  const bar = el("div", "shooter-bar");
  bar.hidden = true;
  screen.append(canvas);
  root.classList.add("shooter");
  root.append(screen, pad, bar, card);

  const context = canvas.getContext("2d", { alpha: false })!;
  const image = context.createImageData(WIDTH, HEIGHT);
  const kept = store("shooter");
  const touchScreen = matchMedia("(pointer: coarse)").matches;
  let engine: Engine | null = null;

  /** A game with other devices: the room, the game it started, and what it has said since. */
  interface Net {
    code: string;
    session: Session;
    lobby: Lobby | null;
    game: Game | null;
    /** Tics that came while the engine was still starting; null once it has them. */
    early: Tic[] | null;
    /** The players the game is held up for. */
    waiting: number[];
    /** For a device that watches: whose eyes it has. */
    viewing: number;
    /** What the bar last showed, so it is only redrawn when that changes. */
    shown: string;
  }
  let net: Net | null = null;
  const watching = () => !!net?.game && net.game.slot < 0;

  interface Action {
    label: string;
    run: () => void;
  }

  function button(action: Action, main: boolean): HTMLButtonElement {
    const node = el("button", main ? "shooter-go" : "lobby-small", action.label);
    node.type = "button";
    node.addEventListener("click", action.run);
    return node;
  }

  /** The screens around the game: a heading, a line or two, and the things to do, the first of them the main one. */
  function show(heading: string, lines: string[], actions: Action[] = [], ...more: HTMLElement[]) {
    const buttons = actions.map((action, i) => button(action, i === 0));
    const row = el("div", "lobby-actions");
    row.append(...buttons);
    card.replaceChildren(el("h1", "", heading), ...lines.map((line) => el("p", "", line)), ...more, row);
    card.hidden = false;
    if (more.length === 0) buttons[0]?.focus();
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
  }, life);
  addEventListener("keyup", (event) => {
    const key = held.get(event.code);
    if (key === undefined) return;
    held.delete(event.code);
    engine?.key(false, key);
  }, life);
  addEventListener("blur", releaseAll, life);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt ??= performance.now();
      releaseAll();
    } else if (hiddenAt !== null) {
      lost += performance.now() - hiddenAt;
      hiddenAt = null;
    }
  }, life);

  // A mouse turns once the page has it to itself (a click on the picture); its buttons fire.
  canvas.addEventListener("click", () => {
    audio.unlock();
    if (!touchScreen && engine && !engine.stopped) void Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
  });
  const locked = () => document.pointerLockElement === canvas;
  document.addEventListener("mousemove", (event) => {
    if (locked()) engine?.mouse(buttons, playing() ? event.movementX * MOUSE : 0, 0);
  }, life);
  for (const type of ["mousedown", "mouseup"] as const)
    document.addEventListener(type, (event) => {
      if (!locked() || event.button > 2) return;
      const bit = [1, 4, 2][event.button]!;
      buttons = type === "mousedown" ? buttons | bit : buttons & ~bit;
      engine?.mouse(buttons, 0, 0);
    }, life);
  document.addEventListener("pointerlockchange", () => {
    if (!locked()) releaseAll();
  }, life);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  /** The touch controls are for someone playing, on a screen that is touched. */
  let touched = touchScreen;
  const fitPad = () => (pad.hidden = !touched || !engine || !!engine.stopped || watching());
  addEventListener("touchstart", () => ((touched = true), fitPad()), { once: true, passive: true, signal: life.signal });

  /** A frame of this engine's game, for as long as it is the one running. */
  function loop(running: Engine) {
    if (engine !== running) return;
    const stick = touch.move();
    const sticks = gamepad.poll();
    engine.analog(stick.forward + sticks.forward, stick.side + sticks.side, sticks.turn);
    if (engine.frame()) {
      touch.update();
      // What is on the screen, for styles (and for tests, which can't see into a canvas).
      const screen = screenOf(engine.state());
      if (root.dataset.screen !== screen) root.dataset.screen = screen;
      if (net?.game) together(net, net.game, engine);
      return void requestAnimationFrame(() => loop(running));
    }
    // The engine has stopped: the player quit from its menu, or it failed.
    const { code, message } = engine.stopped!;
    put();
    leave();
    if (code === 0) show("Thanks for playing", [], [{ label: "Play again", run: home }]);
    else show("The game stopped", [message || "Something went wrong inside the engine."], [{ label: "Start again", run: home }]);
  }

  /** Puts the game away: nothing is running, and nothing of it is on the screen but its last picture. */
  function put() {
    engine = null;
    releaseAll();
    pad.hidden = bar.hidden = true;
    delete root.dataset.screen;
    delete root.dataset.together;
    if (document.pointerLockElement) document.exitPointerLock();
    audio.mute(false);
  }

  /** Leaves the room, if in one, without the leaving being news. */
  function leave() {
    const room = net;
    net = null;
    room?.session.close();
    if (new URLSearchParams(location.search).has("room")) history.replaceState(null, "", location.pathname);
  }

  /** Once a frame in a game with other devices: the bar over the picture, and a watcher's view. */
  function together(room: Net, game: Game, running: Engine) {
    const behind = running.behind();
    const players = running.players();
    // A game being caught up on would play a minute's sounds in a second.
    audio.mute(behind > 35);
    if (game.slot < 0) {
      // Whoever is being watched may have left: the first player still in the game, then.
      if (!((players >> room.viewing) & 1)) room.viewing = Math.max(0, game.players.findIndex((_, slot) => (players >> slot) & 1));
      running.view(room.viewing);
    }
    const names = room.waiting.filter((slot) => (players >> slot) & 1).map((slot) => game.players[slot]?.name ?? "a player");
    const status = behind > 70 ? "Catching up…" : names.length ? `Waiting for ${names.join(" and ")}…` : "";
    const shown = `${status}|${players}|${room.viewing}`;
    if (shown === room.shown) return;
    room.shown = shown;
    root.dataset.together = behind > 70 ? "behind" : names.length ? "waiting" : "running";
    const parts: HTMLElement[] = [];
    if (game.slot < 0) {
      parts.push(el("span", "", "Watching"));
      game.players.forEach((player, slot) => {
        if (!((players >> slot) & 1)) return;
        const pick = button({ label: player.name, run: () => (room.viewing = slot) }, false);
        pick.setAttribute("aria-pressed", String(slot === room.viewing));
        parts.push(pick);
      });
    }
    if (status) parts.push(el("span", "shooter-status", status));
    parts.push(button({ label: "Leave", run: () => (put(), leave(), home()) }, false));
    bar.replaceChildren(...parts);
    bar.hidden = false;
  }

  /** The engine and the game's data, fetched once (with a count on the card the first time). */
  let assets: Promise<{ compiled: WebAssembly.Module; wad: Uint8Array }> | null = null;
  function ready() {
    show("Getting the game ready", ["Starting…"]);
    const status = card.querySelector("p")!;
    assets ??= Promise.all([
      // Compiled as it streams in, where the server says it is WebAssembly; from the whole file where it doesn't.
      WebAssembly.compileStreaming(fetch(options.wasm)).catch(async () => WebAssembly.compile(await (await fetch(options.wasm)).arrayBuffer())),
      asset(options.wad.url, {
        progress(received, total) {
          const megabytes = (received / 1048576).toFixed(0);
          status.textContent = total ? `Downloading the game: ${megabytes} of ${(total / 1048576).toFixed(0)} MB` : `Downloading the game: ${megabytes} MB`;
        },
        // A WAD begins with the letters IWAD or PWAD.
        valid: (bytes) => /^[IP]WAD$/.test(String.fromCharCode(...bytes.subarray(0, 4))),
      }),
    ]).then(([compiled, wad]) => ({ compiled, wad }));
    // A failure isn't kept: the next try fetches again.
    assets.catch(() => (assets = null));
    return assets;
  }

  /** Why something didn't work, in a sentence. */
  const reason = (error: unknown) => (navigator.onLine ? String(error instanceof Error ? error.message : error) : "There is no connection.");

  /** Starts the engine: alone with `args`, or for the room's game. */
  async function run(args: string[], room: Net | null) {
    audio.unlock();
    try {
      const [{ compiled, wad }, files] = await Promise.all([ready(), kept.load()]);
      // Alone, the game is played with the player's own changes to it, if there are any.
      files.set(options.wad.name, room || !options.own ? wad : await options.own.apply(wad));
      const started = await startEngine(
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
          command: room ? (tic, command) => room.session.command(tic, command) : undefined,
          // The engine's own chatter is for the console; what it writes is kept for next time.
          log: (line) => console.debug(line),
          written: kept.save,
          removed: kept.remove,
        },
        args,
      );
      // The room may have closed while the engine was starting.
      if (net !== room) return;
      engine = started;
      room?.early?.forEach(started.tic);
      if (room) room.early = null;
      card.hidden = true;
      fitPad();
      requestAnimationFrame(() => loop(started));
    } catch (error) {
      leave();
      show("The game couldn't start", [navigator.onLine ? reason(error) : "There is no connection, and the game hasn't been downloaded to this device yet."], [{ label: "Try again", run: home }]);
    }
  }

  /** Into a room: a new one, or the one with this code. */
  async function join(code: string | null, name: string, watch: boolean) {
    try {
      localStorage.setItem("open-wasm-name", name);
    } catch {}
    try {
      // The game is fetched before the room is joined, so nobody waits on a download once the host starts.
      await ready();
      show("Joining the game", ["Connecting…"]);
      const room = code ?? (await openRoom(options.rooms!));
      const transport = await connect(options.rooms!, room);
      const link = new URL(`?room=${room}`, location.href).href;
      history.replaceState(null, "", link);
      const mine: Net = (net = { code: room, session: null as unknown as Session, lobby: null, game: null, early: [], waiting: [], viewing: 0, shown: "" });
      mine.session = openSession(transport, name, watch, {
        lobby(lobby) {
          mine.lobby = lobby;
          // Once the game is on, the lobby is only news of who has come and gone.
          if (net === mine && !mine.game && !lobby.playing) showLobby(card, { code: room, link, lobby, session: mine.session, levels: options.levels, leave: () => (leave(), home()) });
        },
        start(game) {
          if (net !== mine) return;
          mine.game = game;
          void run(netArgs(game.settings, game.players.length, game.slot), mine);
        },
        tics: (tics) => (mine.early ? mine.early.push(...tics) : tics.forEach((tic) => engine?.tic(tic))),
        waiting: (slots) => (mine.waiting = slots),
        closed(why) {
          if (net !== mine) return;
          net = null;
          put();
          history.replaceState(null, "", location.pathname);
          show("The game has ended", [why], [{ label: "Back", run: home }]);
        },
      });
    } catch (error) {
      leave();
      show("Couldn't join the game", [reason(error)], [{ label: "Back", run: home }]);
    }
  }

  /** Asks who is playing, and whether to start a game or join one. */
  function gather(code: string | null, watch = false) {
    const name = el("input", "");
    name.maxLength = 16;
    name.setAttribute("autocomplete", "nickname");
    try {
      name.value = localStorage.getItem("open-wasm-name") ?? "";
    } catch {}
    const who = el("label", "lobby-field", "Your name");
    who.append(name);
    const named = () => name.value.trim() || "Player";
    if (code) {
      const play: Action = { label: "Join the game", run: () => void join(code, named(), false) };
      const look: Action = { label: "Just watch", run: () => void join(code, named(), true) };
      return show(`Game ${code}`, ["You have been invited to a game."], [...(watch ? [look, play] : [play, look]), { label: "Back", run: () => (leave(), home()) }], who);
    }
    const other = el("input", "");
    other.maxLength = 4;
    other.placeholder = "ABCD";
    other.autocapitalize = "characters";
    other.setAttribute("aria-label", "A game's code");
    const enter = button({ label: "Join", run: () => /^[A-Za-z]{4}$/.test(other.value.trim()) && void join(other.value.trim().toUpperCase(), named(), false) }, false);
    const joining = el("label", "lobby-field lobby-join", "Or join one, by its code");
    joining.append(other, enter);
    show("Play together", ["Up to four play, together or against each other, each on a device of their own. Anyone else with the link can watch."], [{ label: "Start a new game", run: () => void join(null, named(), false) }, { label: "Back", run: home }], who, joining);
  }

  /** The way in. */
  function home() {
    const alone: Action = { label: "Play", run: () => void run(options.args ?? [], null) };
    const lines = [options.blurb, `The first time, it downloads about ${options.wad.megabytes} MB and keeps it on this device.`];
    /** Under the buttons: what is different about this player's game, and the way to the editor. */
    const foot = el("p", "shooter-own");
    const extras = () => (options.editor || options.own ? [foot] : []);
    if (options.editor) {
      const link = el("a", "", "Change how the game looks and sounds");
      link.href = options.editor;
      foot.append(link);
    }
    const said = el("span", "", "");
    foot.prepend(said);
    void options.own?.note().then(
      (note) => (said.textContent = note ? `${note} ` : ""),
      () => {},
    );
    const start = (actions: Action[]) => {
      show(options.title, lines, actions);
      card.append(...extras());
    };
    start([alone]);
    if (!options.rooms) return;
    // The server may have no rooms (a site with no server at all has none): then there is only playing alone.
    void hasRooms(options.rooms).then((rooms) => {
      const invited = new URLSearchParams(location.search);
      const code = /^[A-Za-z]{4}$/.test(invited.get("room") ?? "") ? invited.get("room")!.toUpperCase() : null;
      // Still on the way in, and not gone on to something else meanwhile.
      if (engine || net || card.querySelector("h1")?.textContent !== options.title) return;
      if (code && rooms) return gather(code, invited.has("watch"));
      if (code) return show(options.title, ["That link is to a game with other people, and this site has no games like that: it has no server behind it. You can still play alone."], [alone]);
      if (rooms) start([alone, { label: "Play together", run: () => gather(null) }]);
    });
  }

  home();
  return {
    destroy() {
      put();
      leave();
      ending.abort();
      audio.close();
      root.classList.remove("shooter");
      root.replaceChildren();
    },
  };
}
