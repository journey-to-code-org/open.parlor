// Playing with other devices, as the page sees it: asking the server for a room, the connection
// to it, and the screen people wait on while the host sets the game up.
import { type Member, type Settings } from "../../net/protocol.ts";
import type { Lobby, Session, Transport } from "./session.ts";

/** Whether the server at `url` (…/play) has rooms. A site with no server behind it (GitHub Pages) doesn't. */
export async function hasRooms(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    return response.ok && Array.isArray(((await response.json()) as { games?: unknown }).games);
  } catch {
    return false;
  }
}

/** Opens a room and gives its code. */
export async function openRoom(url: string): Promise<string> {
  const response = await fetch(url, { method: "POST" });
  const answer = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
  if (!response.ok || !answer.code) throw new Error(answer.error ?? "The parlor couldn't open a game just now.");
  return answer.code;
}

/** A connection to the room with this code, once it is open. */
export function connect(url: string, code: string): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const address = new URL(`${url}/${encodeURIComponent(code)}`, location.href);
    address.protocol = address.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(address);
    socket.binaryType = "arraybuffer";
    const transport: Transport = {
      send: (data) => socket.readyState === WebSocket.OPEN && socket.send(data as string | BufferSource),
      close: () => socket.close(),
      onmessage: null,
      onclose: null,
    };
    let opened = false;
    socket.onopen = () => {
      opened = true;
      resolve(transport);
    };
    socket.onmessage = (event) => transport.onmessage?.(typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer));
    socket.onclose = (event) => {
      if (opened) transport.onclose?.();
      else reject(new Error(event.code === 4404 ? "There is no game with that code. It may be over." : "The parlor's games couldn't be reached."));
    };
  });
}

function el<K extends keyof HTMLElementTagNameMap>(name: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function choice<T extends string | number>(label: string, key: string, options: [value: T, name: string][], value: T, change: (value: T) => void): HTMLLabelElement {
  const select = el("select");
  select.dataset.key = key;
  for (const [option, name] of options) {
    const node = el("option", "", name);
    node.value = String(option);
    node.selected = option === value;
    select.append(node);
  }
  select.addEventListener("change", () => change(options[select.selectedIndex]![0]));
  const wrap = el("label", "lobby-field", label);
  wrap.append(select);
  return wrap;
}

function tick(label: string, key: string, on: boolean, change: (on: boolean) => void): HTMLLabelElement {
  const box = el("input");
  box.type = "checkbox";
  box.checked = on;
  box.dataset.key = key;
  box.addEventListener("change", () => change(box.checked));
  const wrap = el("label", "lobby-tick");
  wrap.append(box, label);
  return wrap;
}

const SKILLS: [number, string][] = [
  [1, "Easiest"],
  [2, "Easy"],
  [3, "Medium"],
  [4, "Hard"],
  [5, "Hardest"],
];

export interface LobbyView {
  code: string;
  /** The address that brings someone else to this room. */
  link: string;
  lobby: Lobby;
  session: Session;
  /** How many episodes the game has, and maps in each. */
  levels: { episodes: number; maps: number };
  leave(): void;
}

/** Fills the card with the room as it stands. Called again whenever the room changes. */
export function showLobby(card: HTMLElement, view: LobbyView): void {
  const { lobby, session } = view;
  const settings = lobby.settings;
  const me = lobby.members.find((member) => member.id === lobby.you);
  const host = lobby.you === lobby.host;
  const players = lobby.members.filter((member) => !member.watching);
  // What had the focus keeps it: the card is rebuilt under whoever is choosing.
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
  const set = (change: Partial<Settings>) => session.settings({ ...settings, ...change });

  const people = el("ul", "lobby-people");
  for (const member of lobby.members) people.append(el("li", member.watching ? "lobby-watching" : "", describe(member, lobby)));

  const share = el("div", "lobby-share");
  const address = el("input");
  address.readOnly = true;
  address.value = view.link;
  address.setAttribute("aria-label", "Link to this game");
  address.addEventListener("focus", () => address.select());
  const canShare = "share" in navigator;
  const copy = el("button", "lobby-small", canShare ? "Share" : "Copy link");
  copy.type = "button";
  copy.dataset.key = "share";
  copy.addEventListener("click", async () => {
    try {
      if (canShare) await navigator.share({ title: document.title, url: view.link });
      else {
        await navigator.clipboard.writeText(view.link);
        copy.textContent = "Copied";
      }
    } catch {
      address.focus();
    }
  });
  share.append(address, copy);

  const setup = el("div", "lobby-setup");
  if (host) {
    setup.append(
      choice("Game", "mode", [["coop", "Together, against the monsters"], ["deathmatch", "Against each other"]] as ["coop" | "deathmatch", string][], settings.mode, (mode) => set({ mode })),
      choice("Skill", "skill", SKILLS, settings.skill, (skill) => set({ skill })),
      choice("Episode", "episode", Array.from({ length: view.levels.episodes }, (_, i) => [i + 1, String(i + 1)] as [number, string]), settings.episode, (episode) => set({ episode })),
      choice("Map", "map", Array.from({ length: view.levels.maps }, (_, i) => [i + 1, String(i + 1)] as [number, string]), settings.map, (map) => set({ map })),
      tick("Monsters", "monsters", settings.monsters, (monsters) => set({ monsters })),
      tick("List this game for anyone to watch", "listed", settings.listed, (listed) => set({ listed })),
    );
  } else {
    const mode = settings.mode === "coop" ? "Together, against the monsters" : `Against each other${settings.monsters ? ", with monsters" : ""}`;
    setup.append(el("p", "", `${mode}. ${SKILLS[settings.skill - 1]![1]} skill, episode ${settings.episode}, map ${settings.map}.`));
  }

  const actions = el("div", "lobby-actions");
  const button = (label: string, key: string, run: () => void, main = false) => {
    const node = el("button", main ? "shooter-go" : "lobby-small", label);
    node.type = "button";
    node.dataset.key = key;
    node.addEventListener("click", run);
    return node;
  };
  if (host) {
    const start = button(players.length > 1 ? `Start with ${players.length} players` : "Start", "start", () => session.start(), true);
    start.disabled = players.length === 0;
    actions.append(start);
  } else {
    actions.append(el("p", "lobby-wait", `Waiting for ${lobby.members.find((member) => member.id === lobby.host)?.name ?? "the host"} to start.`));
  }
  const full = players.length >= 4 && me?.watching;
  if (!full) actions.append(button(me?.watching ? "Play instead" : "Watch instead", "watch", () => session.watch(!me?.watching)));
  actions.append(button("Leave", "leave", view.leave));

  const code = el("h1", "", "Game ");
  code.append(el("span", "lobby-code", view.code));
  card.replaceChildren(code, el("p", "", "Send this link to the people you want to play with, or tell them the code."), share, people, setup, actions);
  card.hidden = false;
  if (focused) card.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
}

function describe(member: Member, lobby: Lobby): string {
  const notes = [member.id === lobby.you ? "you" : "", member.id === lobby.host ? "host" : "", member.watching ? "watching" : ""].filter(Boolean);
  return notes.length ? `${member.name} (${notes.join(", ")})` : member.name;
}
