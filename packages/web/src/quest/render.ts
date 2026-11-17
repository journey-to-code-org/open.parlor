// Zubra Quest's screen: an `ArcadeView` with a `realm`, drawn as a frame of 256 by 224 pixels. The
// top of the frame is what the hero carries (hearts, acorns, keys, the tool in hand, the Stripes,
// a map); the rest is the room he is in, sixteen tiles by eleven.
//
// It keeps what is only for show and never part of the game: the leaves of a cut bush, the sparks
// of a blow, the puff a beaten thing leaves, the room sliding in from the side it was entered by,
// the words of a message coming out a letter at a time. Those come from the view's events.
//
// Nothing here touches the page (see retro/pixels.ts): `draw` returns the frame's pixels.
import { QUEST_TILE, type ArcadeEvent, type ArcadeRealm, type ArcadeThing, type ArcadeView } from "@journey-to-code/games";
import { RETRO_H, RETRO_W, Screen, ink, scaled, speck, textWidth, turned, wrapped, type Rgb, type Sprite } from "../retro/pixels";
import { ARROWS, BOSSES, FOES, FOLK, HEARTS, HOOK_HEAD, ITEMS, SWORD_SLANT, ZUB, tileArt } from "./art";

/** How tall the strip along the top is, and the room under it. */
export const QUEST_HUD = 48;
const FIELD_H = RETRO_H - QUEST_HUD;
const PX = 16;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const WHITE: Rgb = [255, 255, 255];
const DARK: Rgb = [11, 11, 20];
const GOLD = ink("y");
const DIM = ink("3");

interface Bit { x: number; y: number; vx: number; vy: number; life: number; max: number; c: Rgb; big: boolean; fall: number }
interface Word { x: number; y: number; text: string; life: number; c: Rgb }

export interface QuestScreen {
  /** One tick's events: what flies off, what shakes. */
  hear(events: readonly ArcadeEvent[]): void;
  /** Move the bits on by a tick. */
  settle(): void;
  /** The frame for a view. `frame` counts up for as long as the screen is shown. */
  draw(view: ArcadeView, frame: number): Uint8ClampedArray;
  /** The frame before a game: the name, and what there is to choose. `choice` is the line picked out. */
  title(frame: number, lines: readonly string[], choice: number): Uint8ClampedArray;
}

export function questScreen(): QuestScreen {
  const out = new Screen(RETRO_W, RETRO_H);
  const field = new Screen(RETRO_W, FIELD_H);
  const before = new Screen(RETRO_W, FIELD_H);
  let bits: Bit[] = [];
  let words: Word[] = [];
  let shake = 0;
  let flash = 0;
  /** The room coming in: from which side, and how far it has got. */
  let slide: { side: number; t: number } | null = null;
  /** What has just been found, held up for a moment. */
  let found: { what: string; t: number } | null = null;
  let said = "";
  let shown = 0;

  const burst = (x: number, y: number, n: number, colours: string, speed: number, life: number, big = false, fall = 0) => {
    for (let i = 0; i < n; i++) {
      const turn = speck(i, bits.length, Math.round(x + y)) * Math.PI * 2;
      const pace = speed * (0.4 + speck(bits.length, i, 3) * 0.8);
      bits.push({ x, y, vx: Math.cos(turn) * pace, vy: Math.sin(turn) * pace - fall, life, max: life, c: ink(colours[i % colours.length]!), big, fall });
    }
  };

  function hear(events: readonly ArcadeEvent[]) {
    for (const e of events) {
      const x = e.x / PX;
      const y = e.y / PX;
      if (e.kind === "cut") burst(x, y, 9, "gGhG", 1.6, 22, false, 1.2);
      else if (e.kind === "hit") burst(x, y, 5, "1y", 1.8, 10);
      else if (e.kind === "clink") burst(x, y, 4, "1u2", 1.4, 8);
      else if (e.kind === "boom") { burst(x, y, 10, "1yo2", 1.5, 18, true); if (e.text) words.push({ x, y: y - 8, text: e.text, life: 40, c: GOLD }); }
      else if (e.kind === "bigboom") { burst(x, y, 40, "1yorR", 3, 40, true); shake = 16; flash = 6; if (e.text) words.push({ x, y: y - 20, text: e.text, life: 70, c: GOLD }); }
      else if (e.kind === "blast") { shake = 7; burst(x, y, 12, "y1o", 2.6, 16); }
      else if (e.kind === "crumble") burst(x, y, 10, "234", 1.6, 24, true, 1);
      else if (e.kind === "hurt") { shake = 5; flash = 2; }
      else if (e.kind === "quake") shake = 12;
      else if (e.kind === "unlock" || e.kind === "open") burst(x, y, 8, "2y3", 1.2, 16);
      else if (e.kind === "pick") burst(x, y, 5, "1y", 1, 12);
      else if (e.kind === "get") found = { what: e.text ?? "", t: 70 };
      else if (e.kind === "chest") { burst(x, y, 6, "y1", 1.2, 14); found = { what: e.text?.startsWith("coins") ? "coin" : e.text ?? "", t: 30 }; }
      else if (e.kind === "enter") { before.data.set(field.data); slide = { side: e.amount ?? -1, t: 0 }; bits = []; words = []; found = null; }
    }
  }

  function settle() {
    for (const b of bits) { b.x += b.vx; b.y += b.vy; b.vy += b.fall * 0.12; b.vx *= 0.92; b.life--; }
    bits = bits.filter((b) => b.life > 0);
    for (const w of words) { w.y -= 0.4; w.life--; }
    words = words.filter((w) => w.life > 0);
    if (shake > 0) shake--;
    if (flash > 0) flash--;
    if (slide && ++slide.t >= 16) slide = null;
    if (found && --found.t <= 0) found = null;
  }

  // The room's ground is the same from one frame to the next unless a tile changes or the water moves, so it is painted once and copied.
  const ground = new Uint8ClampedArray(field.data.length);
  let groundKey = "";
  function drawRoom(realm: ArcadeRealm, frame: number) {
    const { cols, rows, tiles } = realm;
    const T = QUEST_TILE;
    let sum = 0;
    for (let i = 0; i < tiles.length; i++) sum = (sum * 31 + tiles[i]! + i) | 0;
    const key = `${realm.room}:${(frame >> 3) % 4}:${sum}`;
    if (key === groundKey) { field.data.set(ground); return; }
    groundKey = key;
    const at = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= cols || ty >= rows ? -1 : tiles[ty * cols + tx]!);
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
      const tile = at(tx, ty);
      const seed = Math.floor(speck(tx, ty, realm.room) * 64);
      // Which neighbours are the same: off the edge of the room counts, so woods and walls run on out of sight.
      const same = (dx: number, dy: number) => { const n = at(tx + dx, ty + dy); return n === -1 || n === tile; };
      const mask = (same(1, 0) ? 1 : 0) | (same(0, 1) ? 2 : 0) | (same(-1, 0) ? 4 : 0) | (same(0, -1) ? 8 : 0);
      field.blit(tileArt(realm.biome, tile, seed, frame >> 3, mask), tx * 16, ty * 16);
    }
    // What stands up casts a shadow on the ground below it and to its right: see-through, so the ground shows in it.
    const tall = (tile: number) => tile === T.wall || tile === T.block;
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
      if (tall(at(tx, ty)) || at(tx, ty) === T.pit) continue;
      if (tall(at(tx, ty - 1))) { field.shade(tx * 16, ty * 16, 16, 3, 176); field.shade(tx * 16, ty * 16 + 3, 16, 2, 214); }
      if (tall(at(tx - 1, ty))) { field.shade(tx * 16, ty * 16, 2, 16, 190); field.shade(tx * 16 + 2, ty * 16, 2, 16, 224); }
      else if (tall(at(tx - 1, ty - 1)) && !tall(at(tx, ty - 1))) field.shade(tx * 16, ty * 16, 3, 3, 200);
    }
    ground.set(field.data);
  }

  /** The light of the place, laid over everything in it. */
  function drawLight(realm: ArcadeRealm, frame: number) {
    const { cols, rows, tiles } = realm;
    if (realm.area === "over") {
      if (realm.biome === "marsh") {
        // Mist, in bands that drift.
        for (let y = 0; y < FIELD_H; y += 0.5) { const much = Math.round(26 + 22 * Math.sin(y / 13 + frame / 90) + 10 * Math.sin(y / 5 - frame / 60)); if (much > 0) field.tint(0, y, RETRO_W, 0.5, [200, 232, 224], much); }
        return;
      }
      // The shadows of clouds, going over.
      for (let n = 0; n < 3; n++) {
        const cx = ((frame * (0.22 + n * 0.07) + n * 140) % (RETRO_W + 160)) - 80;
        const cy = 30 + n * 60 + Math.sin(frame / 200 + n) * 10;
        for (let y = -22; y <= 22; y += 0.5) { const half = 58 * Math.sqrt(1 - (y * y) / 500); field.shade(cx - half, cy + y, half * 2, 0.5, 226); }
      }
      return;
    }
    // Under the ground it is dark, but for the hero's lamp and the torches. How far each pixel is
    // from the nearest torch does not change, so it is worked out once for a room.
    const z = field.zoom;
    const wide = field.pw;
    const high = rows * 16 * z;
    let sum = realm.room;
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === QUEST_TILE.torch) sum = (sum * 31 + i) | 0;
    if (sum !== torchKey) {
      torchKey = sum;
      torchFar.fill(1e9);
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] !== QUEST_TILE.torch) continue;
        const lx = ((i % cols) * 16 + 8) * z;
        const ly = (Math.floor(i / cols) * 16 + 6) * z;
        for (let py = 0; py < high; py++) for (let px = 0; px < wide; px++) { const d = ((px - lx) * (px - lx) + (py - ly) * (py - ly)) / 0.72; if (d < torchFar[py * wide + px]!) torchFar[py * wide + px] = d; }
      }
    }
    const dim = realm.area === "cave" ? 168 : 132;
    const hx = viewHero ? viewHero.x * z : -9999;
    const hy = viewHero ? viewHero.y * z : -9999;
    const data = field.data;
    for (let py = 0; py < high; py++) for (let px = 0; px < wide; px++) {
      const mine = (px - hx) * (px - hx) + (py - hy) * (py - hy);
      const near = Math.min(mine, torchFar[py * wide + px]!);
      // Lit all the way out to forty pixels: nothing to do there, and no root to take.
      if (near < 6400) continue;
      // Fading with distance, in many small steps, each broken up along its edge.
      const d = Math.sqrt(near) / z + ((px + py) % 2 ? 1.6 : 0) + (px % 2 && py % 2 ? 0.8 : 0);
      const keep = Math.max(dim, 256 - Math.floor((d - 40) / 4) * 6);
      if (keep < 256) {
        const i = (py * wide + px) * 4;
        data[i] = (data[i]! * keep) >> 8; data[i + 1] = (data[i + 1]! * keep) >> 8; data[i + 2] = (data[i + 2]! * Math.min(256, keep + 20)) >> 8;
      }
    }
  }
  const torchFar = new Float32Array(field.pw * field.ph);
  let torchKey = -1;

  function drawHero(t: ArcadeThing, realm: ArcadeRealm, frame: number) {
    const x = Math.round(t.x / PX);
    const y = Math.round(t.y / PX);
    const face = realm.hero.facing;
    field.shadow(x, y + 5, 5);
    if (found) {
      // Held up over his head for everyone to see.
      field.blit(ZUB[1]![0]!, x - 8, y - 19);
      const item = ITEMS[found.what === "bosskey" ? "bosskey" : found.what] ?? ITEMS.coin!;
      field.blit(item, x - 8, y - 35 - (found.t > 60 ? 70 - found.t : 10) / 3);
      return;
    }
    if (t.ghost && (frame >> 1) % 2) return;
    const walking = t.mark === "walk";
    const body = ZUB[face]![walking ? 1 + ((frame >> 2) % 4) : 0];
    const swing = t.mark === "swing" ? 16 - (t.level ?? 0) : -1;
    const sword = () => {
      if (swing < 0) return;
      const q = [1, 2, 3, 0][face]!;
      const dx = DX[face]!;
      const dy = DY[face]!;
      const blade = realm.hero.blade ? ITEMS.blade! : ITEMS.sword!;
      // Round from one side, through straight ahead, to the other.
      const [art, ox, oy]: [Sprite, number, number] = swing < 4 ? [turned(SWORD_SLANT, q - 1), dx * 9 + dy * 9, dy * 9 - dx * 9] : swing < 11 ? [turned(blade, q), dx * 13, dy * 13] : [turned(SWORD_SLANT, q), dx * 9 - dy * 9, dy * 9 + dx * 9];
      field.blit(art, x + ox - 8, y + oy - 10);
    };
    if (face === 3) sword();
    field.blit(body!, x - 8, y - 19);
    if (face !== 3) sword();
  }

  function drawThing(t: ArcadeThing, realm: ArcadeRealm, frame: number) {
    const x = Math.round(t.x / PX);
    const y = Math.round(t.y / PX);
    const [type, name = ""] = t.kind.split(":");
    if (type === "hero") return drawHero(t, realm, frame);
    if (type === "folk") { field.shadow(x, y + 5, 5); field.blit(FOLK[name] ?? FOLK.elder!, x - 8, y - 19); return; }
    if (type === "ware") {
      const art = ITEMS[name] ?? ITEMS.coin!;
      field.shadow(x, y + 6, 5);
      field.blit(art, x - 8, y - 10 + Math.round(Math.sin(frame / 14 + x) * 1.5));
      const price = String(t.level ?? 0);
      field.text(price, x - Math.floor(textWidth(price) / 2), y + 10, GOLD);
      return;
    }
    if (type === "drop" || type === "item") {
      if (t.ghost && (frame >> 2) % 2) return;
      const art = ITEMS[name] ?? ITEMS.coin!;
      const lift = type === "item" ? Math.round(Math.sin(frame / 10) * 2) + 2 : 0;
      field.shadow(x, y + 5, 4);
      field.blit(art, x - 8, y - 9 - lift);
      if (type === "item" && frame % 12 < 6) field.dot(x - 7 + ((frame >> 2) % 14), y - 12 - lift, WHITE);
      return;
    }
    if (type === "shot") {
      if (name === "arrow") field.blit(ARROWS[Math.round((t.angle ?? 0) / 9000) % 4]!, x - 8, y - 8);
      else if (name === "seed") { field.disc(x, y, 3, DARK); field.disc(x, y, 2, ink("g")); field.dot(x - 1, y - 1, WHITE); }
      else if (name === "orb") { field.disc(x, y, 4, ink("m")); field.disc(x, y, 3, ink(frame % 6 < 3 ? "p" : "k")); field.disc(x, y, 1, WHITE); }
      else if (name === "bomb") { field.shadow(x, y + 5, 4); field.blit(ITEMS.bombs!, x - 8, y - 9, (t.level ?? 99) < 36 && frame % 6 < 3 ? { flash: ink("r") } : {}); }
      else if (name === "blast") {
        const grown = 18 - (t.level ?? 0);
        const r = 8 + grown;
        field.disc(x, y, r, ink(grown > 12 ? "R" : "o"));
        if (grown < 14) field.disc(x, y, Math.round(r * 0.72), ink("y"));
        if (grown < 9) field.disc(x, y, Math.round(r * 0.4), WHITE);
      } else if (name === "hook") {
        const hero = realm && viewHero;
        if (hero) for (let n = 1; n < 8; n++) field.rect(Math.round(hero.x + ((x - hero.x) * n) / 8) - 1, Math.round(hero.y + ((y - hero.y) * n) / 8) - 1, 2, 2, n % 2 ? ink("3") : ink("2"));
        field.blit(HOOK_HEAD, x - 3, y - 3);
      }
      return;
    }
    if (type === "boss") {
      if (t.mark === "gone") return;
      const art = BOSSES[name === "maw" && t.mark === "open" ? "maw:open" : name] ?? BOSSES.maw!;
      const jitter = t.mark === "tell" ? (frame % 2 ? 1 : -1) : 0;
      field.shadow(x, y + 13, 13);
      field.blit(art, x - 16 + jitter, y - 18 + (name === "gloom" ? Math.round(Math.sin(frame / 12) * 2) : 0), { thin: t.mark === "fade", ...(t.ghost && frame % 4 < 2 ? { flash: WHITE } : t.mark === "tell" && frame % 6 < 3 ? { flash: ink("r") } : {}) });
      if (t.mark === "dazed") stars(x, y - 20, frame);
      return;
    }
    const pair = FOES[name] ?? FOES.slime!;
    const resting = t.mark === "rest";
    const art = pair[resting ? 1 : (frame >> 3) % 2];
    const flying = name === "bat" || name === "wisp";
    field.shadow(x, y + 6, flying ? 4 : 5);
    field.blit(art!, x - 8, y - (flying ? 13 : 10) + (name === "wisp" ? Math.round(Math.sin(frame / 9 + x) * 1.5) : 0), { flip: (t.angle ?? 0) === 18000, ...(t.ghost && frame % 4 < 2 ? { flash: WHITE } : t.mark === "tell" && frame % 4 < 2 ? { flash: ink("r") } : {}) });
    if (t.mark === "dazed") stars(x, y - 12, frame);
  }
  let viewHero: { x: number; y: number } | null = null;
  function stars(x: number, y: number, frame: number) {
    for (let n = 0; n < 3; n++) {
      const turn = frame / 8 + (n * Math.PI * 2) / 3;
      const sx = Math.round(x + Math.cos(turn) * 8);
      const sy = Math.round(y + Math.sin(turn) * 3);
      field.rect(sx - 1, sy, 3, 1, GOLD);
      field.rect(sx, sy - 1, 1, 3, GOLD);
    }
  }

  function drawHud(view: ArcadeView, realm: ArcadeRealm, frame: number) {
    const h = realm.hero;
    for (let y = 0; y < QUEST_HUD; y++) out.rect(0, y, RETRO_W, 1, [22 - y * 0.3, 26 - y * 0.35, 64 - y * 0.8]);
    out.rect(0, QUEST_HUD - 2, RETRO_W, 1, ink("5"));
    out.rect(0, QUEST_HUD - 1, RETRO_W, 1, DARK);
    out.text(realm.place, 8, 4, ink("u"));
    // Hearts: ten to a row.
    const hearts = Math.ceil(h.maxHealth / 2);
    for (let n = 0; n < hearts; n++) {
      const left = h.health - n * 2;
      const low = h.health <= 2 && frame % 30 < 15;
      out.blit(HEARTS[left >= 2 ? 0 : left === 1 ? 1 : 2]!, 8 + n * 9, 15, low && left > 0 ? { flash: WHITE } : {});
    }
    out.blit(ITEMS.coin!, 2, 23);
    out.text(String(h.coins).padStart(3, "0"), 18, 30, WHITE);
    if (realm.area === "den") {
      out.blit(ITEMS.key!, 38, 24);
      out.text(String(h.keys), 54, 30, WHITE);
      if (h.bigKey) out.blit(ITEMS.bosskey!, 62, 24);
    }
    // The two buttons, and what each does.
    const box = (x: number, label: string, art: Sprite | null, count: number | null) => {
      out.panel(x, 12, 24, 26, [56, 64, 132], ink("2"));
      out.text(label, x + 9, 3, ink(label === "A" ? "r" : "u"));
      if (art) out.blit(art, x + 4, 16);
      if (count !== null) out.text(String(count), x + 23 - textWidth(String(count)), 30, count ? WHITE : ink("r"));
    };
    box(104, "B", h.tool ? ITEMS[h.tool]! : null, h.tool === "bow" ? h.arrows : h.tool === "bombs" ? h.bombs : null);
    box(132, "A", h.items.includes("sword") ? (h.blade ? ITEMS.blade! : ITEMS.sword!) : null, null);
    // The Stripes.
    out.text("STRIPES", 164, 4, DIM, null);
    for (let n = 0; n < 3; n++) out.blit(ITEMS.stripe!, 162 + n * 14, 12, n < h.relics ? {} : { flash: [40, 44, 80] });
    out.text(String(view.score).padStart(6, "0"), 164, 32, ink("2"));
    // The map: where he has been, and where he is.
    const map = realm.map;
    if (map) {
      const cw = map.cols > 4 ? 6 : 8;
      const chh = map.rows > 4 ? 5 : 7;
      const ox = RETRO_W - 6 - map.cols * (cw + 1);
      const oy = 6 + Math.floor((36 - map.rows * (chh + 1)) / 2);
      out.rect(ox - 2, oy - 2, map.cols * (cw + 1) + 3, map.rows * (chh + 1) + 3, DARK);
      for (let i = 0; i < map.cols * map.rows; i++) {
        const cx = ox + (i % map.cols) * (cw + 1);
        const cy = oy + Math.floor(i / map.cols) * (chh + 1);
        const here = i === map.here;
        out.rect(cx, cy, cw, chh, here ? (frame % 40 < 28 ? GOLD : WHITE) : map.seen.includes(i) ? (realm.area === "den" ? ink("P") : ink("G")) : [34, 38, 66]);
      }
    }
  }

  function drawMessage(realm: ArcadeRealm, heroY: number) {
    if (realm.message !== said) { said = realm.message; shown = 0; }
    if (!said) return;
    shown = Math.min(said.length, shown + 2);
    const lines = wrapped(said, 38);
    const tall = lines.length * 10 + 10;
    const y = heroY > FIELD_H - 70 ? QUEST_HUD + 6 : RETRO_H - tall - 6;
    out.panel(8, y, RETRO_W - 16, tall);
    let left = shown;
    lines.forEach((line, n) => {
      out.text(line.slice(0, Math.max(0, left)), 16, y + 6 + n * 10, WHITE);
      left -= line.length + 1;
    });
  }

  function draw(view: ArcadeView, frame: number): Uint8ClampedArray {
    const realm = view.realm;
    if (!realm) return out.data;
    const hero = view.things.find((t) => t.kind === "hero");
    viewHero = hero ? { x: hero.x / PX, y: hero.y / PX } : null;
    drawRoom(realm, frame);
    // Lowest on the screen is drawn last, so things overlap the way they stand. What lies on the ground goes under.
    const flat = (t: ArcadeThing) => t.kind === "shot:blast";
    for (const t of [...view.things].sort((a, b) => Number(flat(b)) - Number(flat(a)) || a.y - b.y)) drawThing(t, realm, frame);
    drawLight(realm, frame);
    for (const b of bits) {
      const size = b.big && b.life > b.max / 2 ? 2 : 1;
      field.rect(Math.round(b.x), Math.round(b.y), size, size, b.c);
    }
    for (const w of words) field.text(w.text, Math.round(w.x - textWidth(w.text) / 2), Math.round(w.y), w.c);
    if (flash > 0) for (let i = 0; i < field.data.length; i += 4) { field.data[i] = Math.min(255, field.data[i]! + 70); field.data[i + 1] = Math.min(255, field.data[i + 1]! + 50); field.data[i + 2] = Math.min(255, field.data[i + 2]! + 50); }

    out.rect(0, QUEST_HUD, RETRO_W, FIELD_H, DARK);
    const jolt = shake > 0 ? Math.round((speck(frame, 1, 9) - 0.5) * Math.min(6, shake)) : 0;
    const jolt2 = shake > 0 ? Math.round((speck(frame, 2, 9) - 0.5) * Math.min(4, shake)) : 0;
    const clip = { x: 0, y: QUEST_HUD, w: RETRO_W, h: FIELD_H };
    const whole = (s: Screen, x: number, y: number) => out.blit({ w: s.pw, h: s.ph, data: s.data }, x, QUEST_HUD + y, { clip });
    if (slide && slide.side >= 0 && slide.side < 4) {
      // The room before goes out the way he came, and this one follows it in.
      const far = 1 - slide.t / 16;
      const ox = Math.round(DX[slide.side]! * RETRO_W * far);
      const oy = Math.round(DY[slide.side]! * FIELD_H * far);
      whole(before, ox - DX[slide.side]! * RETRO_W, oy - DY[slide.side]! * FIELD_H);
      whole(field, ox, oy);
    } else {
      whole(field, jolt, jolt2);
      if (slide && viewHero) {
        // Down steps or through a door: the dark opens from where he stands.
        const r = slide.t * 14;
        const z = out.zoom;
        for (let py = 0; py < FIELD_H * z; py++) for (let px = 0; px < out.pw; px++) if ((px / z - viewHero.x) * (px / z - viewHero.x) + (py / z - viewHero.y) * (py / z - viewHero.y) > r * r) out.pdot(px, QUEST_HUD * z + py, DARK);
      }
    }
    if (view.boss && view.boss.name) {
      const w = 120;
      const x = (RETRO_W - w) / 2;
      out.panel(x - 3, QUEST_HUD + 4, w + 6, 9, [30, 14, 24], ink("2"), [10, 6, 12]);
      out.rect(x, QUEST_HUD + 7, Math.round((w * view.boss.health) / 1000), 3, ink(view.boss.health < 300 ? "o" : "r"));
      out.text(view.boss.name, Math.round((RETRO_W - textWidth(view.boss.name)) / 2), QUEST_HUD + 15, WHITE);
    }
    drawHud(view, realm, frame);
    if (realm.outcome) {
      out.shade(0, QUEST_HUD, RETRO_W, FIELD_H, realm.outcome === "won" ? 150 : 90);
      const big = realm.outcome === "won" ? "THE STRIPES ARE HOME" : realm.outcome === "lost" ? "THE QUEST IS OVER" : "ZUB FELL ASLEEP";
      out.text(big, Math.round((RETRO_W - textWidth(big, 2)) / 2), 110, realm.outcome === "won" ? GOLD : WHITE, DARK, 2);
      const score = `SCORE ${view.score}`;
      out.text(score, Math.round((RETRO_W - textWidth(score)) / 2), 136, ink("u"));
      if (realm.outcome === "won") for (let n = 0; n < 3; n++) out.blit(scaled(ITEMS.stripe!, 2), 80 + n * 34, 66 + Math.round(Math.sin(frame / 10 + n) * 3));
    } else drawMessage(realm, viewHero?.y ?? 0);
    return out.data;
  }

  function title(frame: number, lines: readonly string[], choice: number): Uint8ClampedArray {
    // A sky going from night at the top to dawn at the hills, without a step in it.
    const bands: Rgb[] = [[16, 12, 52], [36, 24, 88], [72, 40, 118], [124, 56, 124], [188, 84, 112], [240, 132, 96], [252, 188, 108], [255, 228, 150]];
    const z = out.zoom;
    for (let y = 0; y < RETRO_H; y += 1 / z) {
      const at = Math.min(bands.length - 1.001, (y / 150) * (bands.length - 1));
      const lo = bands[Math.floor(at)]!;
      const hi = bands[Math.floor(at) + 1]!;
      const t = at - Math.floor(at);
      out.rect(0, y, RETRO_W, 1 / z, [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t]);
    }
    for (let n = 0; n < 46; n++) { const tw = speck(n, 5, 1) * 60 + frame / 6; if (Math.sin(tw) > -0.3) out.dot(Math.floor(speck(n, 1, 1) * RETRO_W), Math.floor(speck(n, 2, 1) * 76), Math.sin(tw) > 0.7 ? WHITE : [190, 180, 230]); }
    // The sun coming up behind the far hills, with its glow round it, and the hills, each lit along its crest.
    for (const [r, much] of [[64, 26], [52, 34], [42, 46]] as const) for (let y = -r; y <= r; y++) { const half = Math.round(Math.sqrt(r * r - y * y)); out.tint(128 - half, 150 + y, half * 2, 1, [255, 240, 190], much); }
    out.disc(128, 150, 32, [255, 244, 196]);
    out.disc(128, 150, 27, [255, 252, 228]);
    const hill = (base: number, tall: number, wide: number, shift: number, c: Rgb) => {
      for (let px = 0; px < out.pw; px++) {
        const x = px / z;
        const top = Math.round((base - (tall * (0.5 + 0.5 * Math.sin((x + shift) / wide)) + 4 * Math.sin((x + shift) / 9))) * z);
        for (let py = top; py < out.ph; py++) { const down = (py - top) / z; const lit = down < 1.5 ? 1.45 : down < 4 ? 1.18 : 1 - Math.min(1, down / 46) * 0.45; out.pdot(px, py, [Math.min(255, c[0] * lit), Math.min(255, c[1] * lit), Math.min(255, c[2] * lit)]); }
      }
    };
    hill(158, 26, 38, 20, [98, 58, 124]);
    hill(172, 22, 27, 90, [48, 104, 92]);
    hill(190, 16, 46, 10, [56, 150, 68]);
    for (let x = 0; x < RETRO_W; x += 3) if (speck(x, 7, 2) > 0.5) { const y = 200 + Math.floor(speck(x, 3, 2) * 22); out.dot(x, y, [130, 214, 110]); out.dot(x + 1, y - 1, [160, 232, 130]); }
    // The name: gold going to amber, with a dark line all round it.
    const name = "ZUBRA QUEST";
    const nx = Math.round((RETRO_W - textWidth(name, 3)) / 2);
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, 2], [1, 2], [2, 2], [2, 1], [3, 3]] as const) out.text(name, nx + ox, 28 + oy, [40, 16, 48], null, 3);
    out.text(name, nx, 28, [255, 250, 200], null, 3, [236, 130, 40]);
    for (let x = nx; x < nx + textWidth(name, 3); x += 18) out.dot(x + 4, 29, WHITE);
    const under = "THE THREE GREAT STRIPES";
    out.text(under, Math.round((RETRO_W - textWidth(under)) / 2), 58, GOLD);
    const zub = scaled(ZUB[1]![0]!, 2);
    out.shadow(58, 201, 16);
    out.blit(zub, 26, 152 + (frame % 40 < 20 ? 0 : 1));
    out.blit(scaled(ITEMS.stripe!, 2), 190, 168 + Math.round(Math.sin(frame / 12) * 3));
    lines.forEach((line, n) => {
      const y = 92 + n * 14;
      const x = Math.round((RETRO_W - textWidth(line)) / 2);
      if (n === choice) { out.panel(x - 16, y - 4, textWidth(line) + 32, 15, [56, 64, 150], GOLD); out.blit(turned(ITEMS.arrows!, 1), x - 16 + (frame % 30 < 15 ? 0 : 1), y - 5); }
      out.text(line, x, y, n === choice ? WHITE : ink("2"));
    });
    return out.data;
  }

  return { hear, settle, draw, title };
}
