// Surfaces, made here and not downloaded: every texture the table sports are drawn with is
// painted once into a small tile by a few lines of noise and brushwork, kept, and then laid like
// wallpaper. Nothing to license and nothing to fetch, and a tile costs a millisecond or two the
// first time a hole needs it.
//
// A tile is drawn at two device pixels to one CSS pixel and wraps at its edges, so it can repeat
// across a lawn without a seam showing.

export type Texture = "green" | "lawn" | "rough" | "sand" | "water" | "gravel" | "paving" | "soil" | "deck" | "timber" | "brick" | "stone" | "rock" | "felt" | "wood" | "lane" | "terracotta" | "castle";

/** Tiles are this many pixels square, at two to the CSS pixel. */
export const TILE = 256;
export const TILE_DENSITY = 2;

/** The same scatter of numbers every time for the same seed, so a texture is the same texture on every visit. */
export function scatter(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth noise that wraps at the tile's edge: a grid of random heights, blended. `cells` is how many bumps fit across. */
function noise(seed: number, cells: number): (x: number, y: number) => number {
  const rand = scatter(seed);
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const ease = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / TILE) * cells;
    const fy = (y / TILE) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = ease(fx - x0);
    const ty = ease(fy - y0);
    const at = (i: number, j: number) => grid[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)]!;
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function canvasOf(size = TILE): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d")!];
}

/** A tile coloured pixel by pixel: `shade` gives each pixel's colour from where it is. */
function pixels(shade: (x: number, y: number) => Rgb): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const [c, ctx] = canvasOf();
  const img = ctx.createImageData(TILE, TILE);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const [r, g, b] = shade(x, y);
      const i = (y * TILE + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return [c, ctx];
}

/** Draws something at a spot and at every copy of that spot across the tile's edges, so nothing is cut off where the tile repeats. */
function wrapped(ctx: CanvasRenderingContext2D, x: number, y: number, reach: number, draw: (x: number, y: number) => void) {
  for (const dx of [-TILE, 0, TILE]) for (const dy of [-TILE, 0, TILE]) if (x + dx > -reach && x + dx < TILE + reach && y + dy > -reach && y + dy < TILE + reach) draw(x + dx, y + dy);
}

/** Grass of some kind: mottled by two sizes of noise, flecked, with short blades brushed on. */
function grass(seed: number, dark: Rgb, light: Rgb, blades: number, bladeLength: number, fleck: number) {
  const big = noise(seed, 5);
  const small = noise(seed + 1, 23);
  const rand = scatter(seed + 2);
  const [c, ctx] = pixels((x, y) => {
    const t = big(x, y) * 0.6 + small(x, y) * 0.4 + (rand() - 0.5) * fleck;
    return mix(dark, light, Math.min(1, Math.max(0, t)));
  });
  ctx.lineCap = "round";
  for (let i = 0; i < blades; i++) {
    const x = rand() * TILE;
    const y = rand() * TILE;
    const lean = (rand() - 0.5) * bladeLength * 0.8;
    const bright = rand() > 0.5;
    ctx.strokeStyle = bright ? `rgba(${light[0] + 40}, ${light[1] + 40}, ${light[2] + 20}, 0.35)` : `rgba(${dark[0] * 0.6}, ${dark[1] * 0.6}, ${dark[2] * 0.6}, 0.35)`;
    ctx.lineWidth = 1 + rand();
    wrapped(ctx, x, y, bladeLength + 2, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + lean, py - bladeLength * (0.6 + rand() * 0.4));
      ctx.stroke();
    });
  }
  return c;
}

const makers: Record<Texture, () => HTMLCanvasElement> = {
  // The putting surface: fine, even, bright.
  green: () => grass(11, [44, 142, 70], [78, 178, 92], 500, 3, 0.1),
  // The garden round it: longer, darker, patchier.
  lawn: () => grass(21, [44, 104, 44], [92, 148, 62], 1500, 9, 0.16),
  rough: () => grass(31, [34, 90, 44], [70, 128, 60], 1700, 11, 0.2),
  felt: () => grass(41, [30, 118, 78], [44, 138, 92], 0, 0, 0.12),

  sand: () => {
    const big = noise(51, 4);
    const small = noise(52, 30);
    const rand = scatter(53);
    const [c, ctx] = pixels((x, y) => {
      const grain = rand();
      const t = big(x, y) * 0.5 + small(x, y) * 0.3 + grain * 0.35 - 0.08;
      const col = mix([214, 180, 116], [247, 228, 170], Math.min(1, Math.max(0, t)));
      // Now and then a dark grain or a bright one.
      return grain > 0.985 ? mix(col, [120, 92, 50], 0.6) : grain < 0.012 ? [255, 250, 225] : col;
    });
    // Rake marks, barely there.
    ctx.strokeStyle = "rgba(150, 112, 56, 0.12)";
    ctx.lineWidth = 2;
    for (let y = 8; y < TILE; y += 32) {
      ctx.beginPath();
      for (let x = 0; x <= TILE; x += 8) ctx.lineTo(x, y + Math.sin((x / TILE) * Math.PI * 4) * 4);
      ctx.stroke();
    }
    return c;
  },

  water: () => {
    const a = noise(61, 4);
    const b = noise(62, 9);
    const [c] = pixels((x, y) => {
      // Bright threads where two fields of noise cross: the net of light on the bottom of a pond.
      const u = a(x, y) + b(x + 40, y + 90) * 0.5;
      const v = a(x + 128, y + 70) + b(x, y) * 0.5;
      const web = 1 - Math.min(1, Math.abs(u - v) * 7);
      const depth = b(x + 90, y + 20);
      const base = mix([24, 104, 168], [44, 150, 204], depth);
      return mix(base, [170, 232, 246], web * web * 0.62);
    });
    return c;
  },

  gravel: () => {
    const rand = scatter(71);
    const [c, ctx] = pixels(() => {
      const t = rand();
      return mix([150, 142, 128], [196, 188, 172], t);
    });
    for (let i = 0; i < 900; i++) {
      const x = rand() * TILE;
      const y = rand() * TILE;
      const r = 2 + rand() * 3.5;
      const tone = 120 + rand() * 110;
      const squash = 0.6 + rand() * 0.4;
      const turn = rand() * 3;
      wrapped(ctx, x, y, 6, (px, py) => {
        ctx.fillStyle = "rgba(60, 52, 40, 0.5)";
        ctx.beginPath();
        ctx.ellipse(px + 1, py + 1.4, r, r * squash, turn, 0, 7);
        ctx.fill();
        ctx.fillStyle = `rgb(${tone}, ${tone - 6}, ${tone - 18})`;
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * squash, turn, 0, 7);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        ctx.beginPath();
        ctx.ellipse(px - r * 0.25, py - r * 0.25, r * 0.4, r * 0.3, turn, 0, 7);
        ctx.fill();
      });
    }
    return c;
  },

  // Flagstones: four rows of slabs, staggered, each its own grey, with dark joints.
  paving: () => {
    const rand = scatter(81);
    const speck = noise(82, 40);
    const [c, ctx] = canvasOf();
    ctx.fillStyle = "#6f675a";
    ctx.fillRect(0, 0, TILE, TILE);
    const rows = 4;
    const h = TILE / rows;
    for (let r = 0; r < rows; r++) {
      const cuts = r % 2 ? [0, 0.38, 0.7] : [0.16, 0.6];
      cuts.forEach((from, k) => {
        const to = cuts[k + 1] ?? cuts[0]! + 1;
        const tone = 168 + rand() * 40;
        ctx.fillStyle = `rgb(${tone + 8}, ${tone}, ${tone - 16})`;
        wrapped(ctx, from * TILE, r * h, TILE, (px, py) => {
          ctx.beginPath();
          ctx.roundRect(px + 3, py + 3, (to - from) * TILE - 6, h - 6, 5);
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px + 5, py + h - 6);
          ctx.lineTo(px + 5, py + 5);
          ctx.lineTo(px + (to - from) * TILE - 6, py + 5);
          ctx.stroke();
        });
      });
    }
    const img = ctx.getImageData(0, 0, TILE, TILE);
    for (let i = 0; i < TILE * TILE; i++) {
      const k = (speck(i % TILE, Math.floor(i / TILE)) - 0.5) * 26 + (rand() - 0.5) * 12;
      for (let j = 0; j < 3; j++) img.data[i * 4 + j] = Math.max(0, Math.min(255, img.data[i * 4 + j]! + k));
    }
    ctx.putImageData(img, 0, 0);
    return c;
  },

  soil: () => {
    const big = noise(91, 6);
    const rand = scatter(92);
    const [c, ctx] = pixels((x, y) => mix([70, 46, 28], [112, 78, 48], Math.min(1, Math.max(0, big(x, y) * 0.7 + rand() * 0.4 - 0.05))));
    for (let i = 0; i < 260; i++) {
      const x = rand() * TILE;
      const y = rand() * TILE;
      const r = 1.5 + rand() * 3;
      const lightClod = rand() > 0.5;
      wrapped(ctx, x, y, 5, (px, py) => {
        ctx.fillStyle = lightClod ? "rgba(150, 110, 72, 0.5)" : "rgba(40, 24, 12, 0.5)";
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.7, 0, 0, 7);
        ctx.fill();
      });
    }
    return c;
  },

  // Boards laid across, for a bridge: the grain runs along x and each board has its own tone.
  deck: () => planks(101, [150, 104, 60], [196, 148, 92], 4, true),
  // One long face of sawn timber, grain along x.
  timber: () => planks(111, [156, 96, 52], [202, 140, 84], 1, false),
  wood: () => planks(121, [150, 100, 52], [200, 150, 90], 2, false),
  lane: () => planks(131, [206, 164, 100], [232, 198, 138], 8, false),

  // Bricks laid end to end along x, two courses to the tile, staggered.
  brick: () => {
    const rand = scatter(141);
    const [c, ctx] = canvasOf();
    ctx.fillStyle = "#b9ad9c";
    ctx.fillRect(0, 0, TILE, TILE);
    const rows = 4;
    const h = TILE / rows;
    const w = TILE / 2;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < 2; k++) {
        const x = k * w + (r % 2 ? w / 2 : 0);
        const tone = rand();
        const col = mix([150, 62, 44], [196, 96, 66], tone);
        wrapped(ctx, x, r * h, w, (px, py) => {
          ctx.fillStyle = `rgb(${col[0]}, ${col[1]}, ${col[2]})`;
          ctx.beginPath();
          ctx.roundRect(px + 3, py + 3, w - 6, h - 6, 3);
          ctx.fill();
          ctx.fillStyle = "rgba(255, 220, 200, 0.2)";
          ctx.fillRect(px + 4, py + 4, w - 8, 3);
          ctx.fillStyle = "rgba(60, 14, 8, 0.25)";
          ctx.fillRect(px + 4, py + h - 7, w - 8, 3);
        });
      }
    }
    speckle(ctx, 142, 22);
    return c;
  },

  stone: () => {
    const big = noise(151, 5);
    const small = noise(152, 28);
    const rand = scatter(153);
    const [c] = pixels((x, y) => mix([128, 126, 120], [196, 194, 184], Math.min(1, Math.max(0, big(x, y) * 0.55 + small(x, y) * 0.35 + rand() * 0.2 - 0.05))));
    return c;
  },

  rock: () => {
    const big = noise(161, 4);
    const small = noise(162, 20);
    const rand = scatter(163);
    const [c, ctx] = pixels((x, y) => mix([120, 96, 70], [198, 172, 132], Math.min(1, Math.max(0, big(x, y) * 0.6 + small(x, y) * 0.35 + rand() * 0.18 - 0.06))));
    // Cracks and pits.
    for (let i = 0; i < 40; i++) {
      let x = rand() * TILE;
      let y = rand() * TILE;
      ctx.strokeStyle = "rgba(60, 42, 26, 0.45)";
      ctx.lineWidth = 1 + rand() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rand() - 0.5) * 30;
        y += (rand() - 0.5) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return c;
  },

  terracotta: () => {
    const big = noise(171, 6);
    const rand = scatter(172);
    const [c] = pixels((x, y) => mix([176, 92, 52], [214, 128, 80], Math.min(1, Math.max(0, big(x, y) * 0.7 + rand() * 0.3))));
    return c;
  },

  // Damp sand, packed: what a sandcastle is made of.
  castle: () => {
    const big = noise(181, 6);
    const rand = scatter(182);
    const [c] = pixels((x, y) => mix([190, 150, 86], [226, 192, 124], Math.min(1, Math.max(0, big(x, y) * 0.6 + rand() * 0.45 - 0.05))));
    return c;
  },
};

function speckle(ctx: CanvasRenderingContext2D, seed: number, amount: number) {
  const rand = scatter(seed);
  const img = ctx.getImageData(0, 0, TILE, TILE);
  for (let i = 0; i < TILE * TILE; i++) {
    const k = (rand() - 0.5) * amount;
    for (let j = 0; j < 3; j++) img.data[i * 4 + j] = Math.max(0, Math.min(255, img.data[i * 4 + j]! + k));
  }
  ctx.putImageData(img, 0, 0);
}

/** Sawn wood with the grain along x: `boards` boards down the tile, with gaps between them if `gaps`. */
function planks(seed: number, dark: Rgb, light: Rgb, boards: number, gaps: boolean) {
  const rand = scatter(seed);
  const wobble = noise(seed + 1, 6);
  const tones = Array.from({ length: boards }, () => rand());
  const h = TILE / boards;
  const [c, ctx] = pixels((x, y) => {
    const board = Math.min(boards - 1, Math.floor(y / h));
    // Grain: thin streaks that wander a little along the length.
    const v = y + wobble(x, y) * 14;
    const streak = Math.sin(v * 1.9 + board * 3) * 0.5 + Math.sin(v * 0.7 + board) * 0.5;
    const t = tones[board]! * 0.5 + 0.25 + streak * 0.16 + (rand() - 0.5) * 0.1;
    return mix(dark, light, Math.min(1, Math.max(0, t)));
  });
  if (gaps) {
    for (let b = 0; b < boards; b++) {
      ctx.fillStyle = "rgba(40, 22, 8, 0.75)";
      ctx.fillRect(0, b * h - 1.5, TILE, 3);
      ctx.fillStyle = "rgba(255, 236, 200, 0.22)";
      ctx.fillRect(0, b * h + 1.5, TILE, 2);
      // A nail at each end of the tile.
      ctx.fillStyle = "rgba(50, 40, 30, 0.7)";
      for (const x of [14, TILE - 14]) {
        ctx.beginPath();
        ctx.arc(x, b * h + h / 2, 2.4, 0, 7);
        ctx.fill();
      }
    }
  }
  // A knot or two.
  for (let i = 0; i < (gaps ? 3 : 2); i++) {
    const x = rand() * TILE;
    const y = rand() * TILE;
    wrapped(ctx, x, y, 10, (px, py) => {
      ctx.strokeStyle = "rgba(70, 36, 12, 0.5)";
      ctx.lineWidth = 1.5;
      for (const r of [2, 5, 8]) {
        ctx.beginPath();
        ctx.ellipse(px, py, r * 1.8, r, 0, 0, 7);
        ctx.stroke();
      }
    });
  }
  return c;
}

const tiles = new Map<Texture, HTMLCanvasElement>();
/** The tile for a texture, painted the first time it is asked for. */
export function tile(name: Texture): HTMLCanvasElement {
  let t = tiles.get(name);
  if (!t) tiles.set(name, (t = makers[name]()));
  return t;
}

/**
 * A fill that lays a texture at the same size on the screen whatever the canvas is zoomed to.
 * `unit` is the length of one CSS pixel in the canvas's present units; `turn` (radians) lays the
 * grain along a direction; `zoom` makes the texture bigger than life.
 */
export function textured(ctx: CanvasRenderingContext2D, name: Texture, unit: number, turn = 0, zoom = 1, at: [number, number] = [0, 0]): CanvasPattern {
  const pattern = ctx.createPattern(tile(name), "repeat")!;
  const k = (unit * zoom) / TILE_DENSITY;
  pattern.setTransform(new DOMMatrix().translate(at[0], at[1]).rotate((turn * 180) / Math.PI).scale(k));
  return pattern;
}
