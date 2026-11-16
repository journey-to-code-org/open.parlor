// The shape of each car: a side profile, shared by the strip (pushed out to the car's width in 3D) and
// the garage (drawn flat, side on).

export type Pt = [x: number, y: number];
export interface BodyStyle {
  width: number;
  profile: Pt[];
  /** Windscreen and back window: each a line from its bottom edge to its top. */
  glass: [Pt, Pt][];
  side: Pt[];
  /** Where a wing would bolt on: the back deck's height. */
  deck: number;
}
export const STYLES: Record<string, BodyStyle> = {
  hatch: { width: 1.6, deck: 1.38, profile: [[0, 0.25], [0, 0.95], [0.28, 1.38], [1.9, 1.42], [2.55, 0.98], [3.6, 0.86], [3.7, 0.5], [3.7, 0.25]], glass: [[[0.02, 0.98], [0.26, 1.34]], [[2.52, 1.0], [1.95, 1.39]]], side: [[0.45, 0.98], [0.6, 1.33], [1.85, 1.36], [2.35, 1.0]] },
  sedan: { width: 1.7, deck: 0.98, profile: [[0, 0.25], [0, 0.92], [0.85, 0.98], [1.3, 1.4], [2.6, 1.42], [3.2, 0.98], [4.4, 0.86], [4.5, 0.5], [4.5, 0.25]], glass: [[[0.9, 1.0], [1.27, 1.36]], [[3.16, 1.0], [2.65, 1.39]]], side: [[1.15, 1.0], [1.45, 1.34], [2.55, 1.36], [3.0, 1.0]] },
  wagon: { width: 1.76, deck: 1.44, profile: [[0, 0.25], [0, 1.0], [0.16, 1.44], [2.9, 1.46], [3.5, 1.0], [4.7, 0.88], [4.8, 0.5], [4.8, 0.25]], glass: [[[0.02, 1.03], [0.15, 1.4]], [[3.46, 1.02], [2.95, 1.43]]], side: [[0.35, 1.03], [0.45, 1.38], [2.85, 1.4], [3.3, 1.03]] },
  pickup: { width: 1.66, deck: 0.95, profile: [[0, 0.3], [0, 0.95], [1.9, 0.95], [1.95, 1.5], [3.0, 1.52], [3.5, 1.02], [4.5, 0.92], [4.6, 0.55], [4.6, 0.3]], glass: [[[1.91, 1.02], [1.94, 1.44]], [[3.46, 1.04], [3.04, 1.48]]], side: [[2.1, 1.05], [2.15, 1.44], [2.95, 1.46], [3.3, 1.05]] },
  van: { width: 1.8, deck: 1.72, profile: [[0, 0.28], [0, 1.1], [0.1, 1.72], [3.3, 1.74], [4.1, 1.1], [4.5, 0.95], [4.6, 0.55], [4.6, 0.28]], glass: [[[0.02, 1.14], [0.09, 1.66]], [[4.05, 1.13], [3.36, 1.7]]], side: [[0.3, 1.14], [0.35, 1.64], [3.25, 1.66], [3.85, 1.14]] },
  coupe: { width: 1.72, deck: 0.94, profile: [[0, 0.24], [0, 0.88], [0.5, 0.96], [1.5, 1.26], [2.45, 1.28], [3.1, 0.92], [4.3, 0.78], [4.4, 0.46], [4.4, 0.24]], glass: [[[0.58, 0.99], [1.46, 1.24]], [[3.05, 0.95], [2.5, 1.25]]], side: [[1.2, 0.97], [1.65, 1.21], [2.42, 1.23], [2.9, 0.95]] },
  roadster: { width: 1.64, deck: 0.84, profile: [[0, 0.24], [0, 0.82], [1.2, 0.9], [2.3, 0.92], [3.8, 0.76], [3.9, 0.46], [3.9, 0.24]], glass: [[[2.42, 0.93], [2.2, 1.2]]], side: [] },
};
export const CARS: Record<string, { style: keyof typeof STYLES; wing?: boolean; scale?: number }> = {
  sparrow: { style: "hatch" }, custodian: { style: "sedan" }, estate: { style: "wagon" }, mule: { style: "pickup" }, caravel: { style: "van" },
  wasp: { style: "hatch", wing: true }, brumby: { style: "coupe", scale: 1.05 }, kite: { style: "roadster" }, brick: { style: "sedan", scale: 1.04 },
  umbra: { style: "coupe", wing: true }, cyclone: { style: "coupe", scale: 0.97 }, zenith: { style: "coupe", wing: true, scale: 1.06 },
};
