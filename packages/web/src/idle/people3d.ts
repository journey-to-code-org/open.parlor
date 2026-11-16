// The people of Delbie's, for the 3-D scenes (the counter and the floor plan). Three.js, so this is
// only ever fetched along with a scene.
//
// Everybody is the same simple figure: legs, a shirt, a head, two arms that swing from the
// shoulder. What tells them apart is taken from what the game itself says about each of them: a
// build, a head of hair or a cap, a beard, and one thing of their own. Tommy has his tie and his
// clipboard; Pluto his old cap (and, where there is a desk to put it on, a rabbit); B-Rice is big
// and has his pasta; Ricky is in his mechanic's blues with his phone out; McMikey has the hood and
// the headset; Dubs is broad, with a beard; Snowcap is tall, with the hair; Two-Thirty has her
// blazer and her bun; Storytime his flat cap, Wheels his beanie, Ears his cap on backwards (and the
// ears), Red the hair, the beard and the sunglasses.
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Object3D, SphereGeometry, type Material } from "three";

const paints = new Map<string, MeshStandardMaterial>();
export function paint(color: string, rough = 0.8, metal = 0, glow = 0): MeshStandardMaterial {
  const key = `${color}/${rough}/${metal}/${glow}`;
  let m = paints.get(key);
  if (!m) paints.set(key, (m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: glow ? color : "#000000", emissiveIntensity: glow })));
  return m;
}
export function put<T extends Object3D>(parent: Object3D, o: T, x = 0, y = 0, z = 0): T {
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
const solid = <T extends Mesh>(o: T) => {
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
};
export const box = (w: number, h: number, d: number, m: Material) => solid(new Mesh(new BoxGeometry(w, h, d), m));
export const drum = (top: number, bottom: number, h: number, m: Material, sides = 14) => solid(new Mesh(new CylinderGeometry(top, bottom, h, sides), m));
export const ball = (r: number, m: Material) => solid(new Mesh(new SphereGeometry(r, 16, 12), m));

export const SKINS = ["#f1c9a5", "#e0ac84", "#c68a5e", "#9a6a45", "#f4d6ba"];
export const SHIRTS = ["#3f78b5", "#b5483f", "#4c8a4a", "#8a5bb5", "#c98a2c", "#3a9a9a", "#6a6f7a", "#b53f7a"];

export interface Person {
  group: Group;
  arms: [Group, Group];
  head: Mesh;
  /** So that no two of them move in step. */
  phase: number;
}
export interface Build {
  shirt: string;
  skin: string;
  /** Hair, where there is no cap over it; null for a bald head. */
  hair?: string | null;
  cap?: string | null;
  /** The peak at the back. */
  backwards?: boolean;
  /** How broad and how tall, 1 being anybody. */
  wide?: number;
  tall?: number;
  beard?: string;
  glasses?: string;
  trousers?: string;
}

/** Somebody, standing, about 1.6 high and facing +z. */
export function person(b: Build, seed: number): Person {
  const g = new Group();
  const cloth = paint(b.shirt, 0.85);
  const flesh = paint(b.skin, 0.7);
  const wide = b.wide ?? 1;
  put(g, drum(0.2 * wide, 0.24 * wide, 0.5, paint(b.trousers ?? "#2b3240", 0.9)), 0, 0.25, 0);
  put(g, drum(0.25 * wide, 0.22 * wide, 0.62, cloth), 0, 0.82, 0);
  put(g, ball(0.25, cloth), 0, 1.12, 0).scale.set(wide, 0.5, 0.9 * wide);
  const head = put(g, ball(0.2, flesh), 0, 1.42, 0);
  if (b.cap) {
    put(head, solid(new Mesh(new SphereGeometry(0.21, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint(b.cap, 0.7))), 0, 0.04, 0);
    put(head, box(0.26, 0.03, 0.2, paint(b.cap, 0.7)), 0, 0.06, b.backwards ? -0.2 : 0.2);
  } else if (b.hair !== null) put(head, solid(new Mesh(new SphereGeometry(0.205, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), paint(b.hair ?? ["#3a2a1c", "#1d1a18", "#8a8a8a", "#6a4a2a"][seed % 4]!, 0.9))), 0, 0.03, -0.01);
  if (b.beard) put(head, ball(0.15, paint(b.beard, 0.9)), 0, -0.09, 0.08).scale.set(1, 0.75, 0.8);
  if (b.glasses) {
    for (const side of [-1, 1]) put(head, box(0.1, 0.07, 0.02, paint(b.glasses, 0.3, 0.2)), side * 0.075, 0.03, 0.19);
    put(head, box(0.05, 0.015, 0.02, paint(b.glasses, 0.3, 0.2)), 0, 0.04, 0.19);
  }
  const arms = [-1, 1].map((side) => {
    const arm = new Group();
    put(arm, drum(0.07, 0.06, 0.5, cloth, 8), 0, -0.25, 0);
    put(arm, ball(0.075, flesh), 0, -0.52, 0);
    put(g, arm, side * 0.3 * wide, 1.1, 0);
    return arm;
  }) as [Group, Group];
  g.scale.set(1, b.tall ?? 1, 1);
  return { group: g, arms, head, phase: (seed % 100) / 16 };
}

/** Anybody: a customer in the line, by a number that is always the same for the same one. */
export function anybody(seed: number): Person {
  return person({ shirt: SHIRTS[(seed * 3 + 1) % SHIRTS.length]!, skin: SKINS[(seed * 2) % SKINS.length]!, cap: seed % 3 === 1 ? "#33383f" : null }, seed + 11);
}

/** Delbie: the yellow cap. */
export function delbie(): Person {
  return person({ shirt: "#1f2a3a", skin: SKINS[1]!, cap: "#f2c230" }, 1);
}

/** One of the crew, as the game describes them. Somebody this file hasn't met gets a look from their name. */
export function crewPerson(id: string): Person {
  const dark = paint("#1d1f24", 0.5);
  switch (id) {
    case "tommy": {
      // The Goody-Two-Shoes: a clean white shirt, a tie, hair combed flat, and the freight on a clipboard.
      const p = person({ shirt: "#f4f4f0", skin: SKINS[0]!, hair: "#6a4a2a", trousers: "#3a4a66" }, 21);
      put(p.group, box(0.07, 0.34, 0.02, paint("#b5483f", 0.6)), 0, 0.92, 0.235);
      put(p.arms[0], box(0.2, 0.26, 0.02, paint("#c9a36b", 0.8)), 0, -0.5, 0.09);
      return p;
    }
    case "pluto":
      // The Veteran: grey under a cap that has been through every store move.
      return person({ shirt: "#6f7f5a", skin: SKINS[4]!, cap: "#4a5a3a", beard: "#b9b9b4", glasses: "#3a3a3a" }, 22);
    case "brice": {
      // The Heavy Hitter: big, calm, and never far from a bowl of pasta.
      const p = person({ shirt: "#22252b", skin: SKINS[3]!, hair: "#15130f", wide: 1.3, tall: 1.06 }, 23);
      put(p.arms[1], drum(0.12, 0.08, 0.08, paint("#f4f4f0", 0.5)), 0, -0.56, 0.12);
      put(p.arms[1], drum(0.1, 0.1, 0.03, paint("#e8b04a", 0.7)), 0, -0.52, 0.12);
      return p;
    }
    case "ricky": {
      // The Phantom Tech: a mechanic's blues, and the phone the chickens are on.
      const p = person({ shirt: "#2f4f8a", trousers: "#2f4f8a", skin: SKINS[2]!, hair: "#1d1a18" }, 24);
      put(p.arms[1], box(0.08, 0.14, 0.015, new MeshStandardMaterial({ color: "#15171c", emissive: "#7dd3ff", emissiveIntensity: 0.9 })), 0, -0.56, 0.08);
      return p;
    }
    case "mcmikey": {
      // The Tech Wizard: the hood up, glasses, and a headset.
      const p = person({ shirt: "#6a4fb5", skin: SKINS[0]!, hair: "#3a2a1c", glasses: "#15171c" }, 25);
      put(p.head, solid(new Mesh(new SphereGeometry(0.235, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), paint("#6a4fb5", 0.9))), 0, 0.0, -0.05);
      put(p.head, box(0.44, 0.03, 0.03, dark), 0, 0.2, 0);
      for (const side of [-1, 1]) put(p.head, drum(0.06, 0.06, 0.04, dark, 10), side * 0.21, 0, 0).rotation.z = Math.PI / 2;
      return p;
    }
    case "dubs":
      // The VW Whisperer: broad, bearded, in the blue.
      return person({ shirt: "#1f5fa8", skin: SKINS[1]!, hair: "#5a3a1c", beard: "#5a3a1c", wide: 1.35 }, 26);
    case "snowcap":
      // Warranty & Returns: tall, and the hair is why he is called that.
      return person({ shirt: "#3a8a7a", skin: SKINS[0]!, hair: "#ffffff", tall: 1.14 }, 27);
    case "twothirty": {
      // HR & Billing: a blazer, her hair up, and one eye on the clock.
      const p = person({ shirt: "#2f7a86", skin: SKINS[4]!, hair: "#3a2a1c", glasses: "#a33a30", trousers: "#2a2d33" }, 28);
      put(p.head, ball(0.09, paint("#3a2a1c", 0.9)), 0, 0.2, -0.08);
      return p;
    }
    case "storytime":
      // The Storyteller: a flat cap, a cardigan, and all day.
      return person({ shirt: "#8a6a4a", skin: SKINS[0]!, cap: "#6a5a4a", beard: "#d8d8d2" }, 29);
    case "wheels":
      // The Reluctant Driver: a beanie pulled down, and no wish to be here.
      return person({ shirt: "#5a5f6a", skin: SKINS[2]!, cap: "#2a2d33" }, 30);
    case "ears": {
      // The Speed Demon: the cap on backwards, and the ears.
      const p = person({ shirt: "#d84a2c", skin: SKINS[1]!, cap: "#d84a2c", backwards: true }, 31);
      for (const side of [-1, 1]) put(p.head, ball(0.08, paint(SKINS[1]!, 0.7)), side * 0.21, 0, 0).scale.set(0.5, 1.2, 1);
      return p;
    }
    case "red": {
      // The Vacation Sniper: tall, the red hair, the perfect beard, and sunglasses indoors.
      return person({ shirt: "#e8d9a0", skin: SKINS[4]!, hair: "#c8442a", beard: "#c8442a", glasses: "#15171c", tall: 1.14 }, 32);
    }
    default: {
      const seed = [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
      return person({ shirt: SHIRTS[seed % SHIRTS.length]!, skin: SKINS[(seed >> 3) % SKINS.length]!, cap: seed % 2 ? "#33383f" : null }, seed);
    }
  }
}

/** Pluto breeds rabbits: one of them, for his desk. */
export function rabbit(): Group {
  const g = new Group();
  const fur = paint("#f4f1ea", 0.9);
  put(g, ball(0.09, fur), 0, 0.08, 0).scale.set(1, 0.85, 1.3);
  put(g, ball(0.06, fur), 0, 0.15, 0.1);
  for (const side of [-1, 1]) put(g, box(0.025, 0.12, 0.02, fur), side * 0.03, 0.25, 0.09);
  put(g, ball(0.03, fur), 0, 0.07, -0.12);
  return g;
}
