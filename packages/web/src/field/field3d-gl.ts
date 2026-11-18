// The three.js half of a field game (see field3d.ts): fetched only where WebGL works.
//
// Five passes a frame, all flat (there is no third dimension here, only light):
//   1. The painter's picture, lit by whatever is burning; then smoke, dust and flying earth over
//      it, lit the same way; then everything hot (fire, sparks, flashes), adding its light.
//   2. Everything hot again, alone, on a small target.
//   3, 4. That blurred, across and then down: the glow.
//   5. The first picture, bent where a ring of air is going out from a blast and shaken with the
//      screen, with the glow laid over it and the corners darkened.
import * as THREE from "three";
import type { Field3d, Frame3d } from "./field3d";
import type { Particle } from "./fx";

const LIGHTS = 10;
const WAVES = 4;
/** How many bits can be on screen at once. */
const MOST = 6000;

const QUAD = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** The light at a pixel from everything burning: shared by the picture and the smoke. */
const LIT = /* glsl */ `
  uniform vec3 uLight[${LIGHTS}];
  uniform vec3 uTint[${LIGHTS}];
  vec3 lightAt(vec2 at) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < ${LIGHTS}; i++) {
      float reach = uLight[i].z;
      if (reach <= 0.0) continue;
      float near = max(0.0, 1.0 - distance(at, uLight[i].xy) / reach);
      sum += uTint[i] * near * near;
    }
    return sum;
  }
`;

const WORLD = /* glsl */ `
  precision highp float;
  uniform sampler2D tWorld;
  varying vec2 vUv;
  ${LIT}
  void main() {
    vec3 base = texture2D(tWorld, vUv).rgb;
    vec3 light = lightAt(gl_FragCoord.xy);
    // Lit, a thing is brighter in its own colour, and takes a little of the light's.
    gl_FragColor = vec4(base * (1.0 + light * 1.15) + light * 0.07, 1.0);
  }
`;

/** One bit: a square stood where it is, turned the way it is going and stretched if it is a spark. */
const BIT_VERTEX = /* glsl */ `
  attribute vec2 aAt;
  attribute vec4 aShape; // size across, stretch along, direction x and y
  attribute vec4 aColour;
  attribute float aHard;
  uniform vec2 uSize;
  varying vec2 vCorner;
  varying vec4 vColour;
  varying float vHard;
  varying vec2 vAt;
  void main() {
    vec2 along = aShape.zw;
    vec2 across = vec2(-along.y, along.x);
    vec2 at = aAt + along * position.x * aShape.x * aShape.y + across * position.y * aShape.x;
    vCorner = position.xy;
    vColour = aColour;
    vHard = aHard;
    vAt = aAt;
    gl_Position = vec4(at / uSize * 2.0 - 1.0, 0.0, 1.0);
  }
`;
/** Smoke, dust and earth: laid over the picture, and lit by what burns near them. */
const SOFT = /* glsl */ `
  precision highp float;
  varying vec2 vCorner;
  varying vec4 vColour;
  varying float vHard;
  varying vec2 vAt;
  ${LIT}
  void main() {
    float far = length(vCorner);
    // A bit of earth is a hard-edged scrap; smoke and dust fade out from the middle.
    float cover = mix(pow(max(0.0, 1.0 - far), 1.6), step(max(abs(vCorner.x), abs(vCorner.y)), 0.75), vHard) * vColour.a;
    vec3 shade = vColour.rgb * (1.0 - 0.3 * vHard * step(0.0, -vCorner.y));
    vec3 light = lightAt(vAt);
    gl_FragColor = vec4((shade * (1.0 + light * 1.8) + light * 0.12) * cover, cover);
  }
`;
/** Fire, sparks and flashes: light added to whatever is behind. */
const HOT = /* glsl */ `
  precision highp float;
  varying vec2 vCorner;
  varying vec4 vColour;
  void main() {
    float far = length(vCorner);
    float glow = pow(max(0.0, 1.0 - far), 1.8);
    gl_FragColor = vec4(vColour.rgb * glow * vColour.a, 0.0);
  }
`;
const BLUR = /* glsl */ `
  precision highp float;
  uniform sampler2D tFrom;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec3 sum = texture2D(tFrom, vUv).rgb * 0.227;
    sum += (texture2D(tFrom, vUv + uStep * 1.385).rgb + texture2D(tFrom, vUv - uStep * 1.385).rgb) * 0.316;
    sum += (texture2D(tFrom, vUv + uStep * 3.231).rgb + texture2D(tFrom, vUv - uStep * 3.231).rgb) * 0.07;
    gl_FragColor = vec4(sum, 1.0);
  }
`;
const LAST = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tGlow;
  uniform vec2 uSize;
  uniform vec2 uJolt;
  uniform vec4 uWave[${WAVES}]; // where, how far out the ring is now, how hard it bends
  uniform float uWide;
  varying vec2 vUv;
  void main() {
    vec2 at = gl_FragCoord.xy;
    vec2 bent = uJolt;
    for (int i = 0; i < ${WAVES}; i++) {
      if (uWave[i].w <= 0.0) continue;
      vec2 from = at - uWave[i].xy;
      float far = length(from);
      float off = (far - uWave[i].z) / uWide;
      // Only the ring itself bends what is seen through it: pushed outward, most at its middle.
      if (abs(off) < 1.0 && far > 0.001) bent -= (from / far) * (1.0 - off * off) * uWave[i].w;
    }
    vec2 uv = vUv + bent / uSize;
    vec3 colour = texture2D(tScene, uv).rgb + texture2D(tGlow, uv).rgb * 0.6;
    // The corners a little darker, as through a lens.
    float edge = distance(vUv, vec2(0.5)) * 1.25;
    colour *= 1.0 - 0.3 * smoothstep(0.55, 1.05, edge);
    gl_FragColor = vec4(colour, 1.0);
  }
`;

/** A colour as the graphics card wants it: three numbers from 0 to 1. Kept, since the same few colours come round again and again. */
const colours = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = colours.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    colours.set(hex, c);
  }
  return c;
}
/** Fire's colour as it burns out: white hot, yellow, orange, red. */
function fireColour(t: number): [number, number, number] {
  if (t < 0.15) return [1, 0.96, 0.82];
  if (t < 0.38) return [1, 0.74, 0.26];
  if (t < 0.6) return [1, 0.42, 0.12];
  return [0.75, 0.16, 0.07];
}

/** A layer of bits, all drawn at once: the arrays are filled each frame and handed over. */
function layer(material: THREE.ShaderMaterial) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const make = (name: string, size: number) => {
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(MOST * size), size);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
    return attribute;
  };
  const at = make("aAt", 2);
  const shape = make("aShape", 4);
  const colour = make("aColour", 4);
  const hard = make("aHard", 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  let n = 0;
  return {
    mesh,
    begin: () => (n = 0),
    add(x: number, y: number, size: number, stretch: number, dx: number, dy: number, c: readonly [number, number, number], alpha: number, isHard = 0) {
      if (n >= MOST || alpha <= 0.004 || size <= 0.1) return;
      (at.array as Float32Array).set([x, y], n * 2);
      (shape.array as Float32Array).set([size, stretch, dx, dy], n * 4);
      (colour.array as Float32Array).set([c[0], c[1], c[2], alpha], n * 4);
      (hard.array as Float32Array)[n] = isHard;
      n++;
    },
    end() {
      geometry.instanceCount = n;
      for (const attribute of [at, shape, colour, hard]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, n * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    },
    dispose: () => geometry.dispose(),
  };
}

export function build(canvas: HTMLCanvasElement): Field3d | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  // The painter's colours go through untouched: what it painted is what is shown, plus light.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.autoClear = false;
  let lost = false;
  canvas.addEventListener("webglcontextlost", () => (lost = true));

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const plane = new THREE.PlaneGeometry(2, 2);
  const lights = Array.from({ length: LIGHTS }, () => new THREE.Vector3());
  const tints = Array.from({ length: LIGHTS }, () => new THREE.Vector3());
  const waves = Array.from({ length: WAVES }, () => new THREE.Vector4());
  const size = new THREE.Vector2(1, 1);
  const lit = { uLight: { value: lights }, uTint: { value: tints } };

  const texture = new THREE.Texture();
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const world = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: QUAD, fragmentShader: WORLD, uniforms: { tWorld: { value: texture }, ...lit }, depthTest: false, depthWrite: false }));
  const soft = layer(new THREE.ShaderMaterial({ vertexShader: BIT_VERTEX, fragmentShader: SOFT, uniforms: { uSize: { value: size }, ...lit }, depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor }));
  const hot = layer(new THREE.ShaderMaterial({ vertexShader: BIT_VERTEX, fragmentShader: HOT, uniforms: { uSize: { value: size } }, depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));
  const blurStep = new THREE.Vector2();
  const blur = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: QUAD, fragmentShader: BLUR, uniforms: { tFrom: { value: null }, uStep: { value: blurStep } }, depthTest: false, depthWrite: false }));
  const last = new THREE.Mesh(plane, new THREE.ShaderMaterial({ vertexShader: QUAD, fragmentShader: LAST, uniforms: { tScene: { value: null }, tGlow: { value: null }, uSize: { value: size }, uJolt: { value: new THREE.Vector2() }, uWave: { value: waves }, uWide: { value: 20 } }, depthTest: false, depthWrite: false }));

  soft.mesh.renderOrder = 1;
  hot.mesh.renderOrder = 2;
  const sceneAll = new THREE.Scene().add(world, soft.mesh, hot.mesh);
  const sceneHot = new THREE.Scene();
  const sceneBlur = new THREE.Scene().add(blur);
  const sceneLast = new THREE.Scene().add(last);
  const target = (w: number, h: number) => new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, colorSpace: THREE.NoColorSpace });
  let full = target(2, 2);
  let glowA = target(2, 2);
  let glowB = target(2, 2);
  let sized = "";

  /** Put one bit into the layer it belongs in: where it is on the screen (y up, in the screen's own pixels), how big, what colour. */
  const place = (frame: Frame3d, p: Particle, px: number) => {
    const t = p.age / p.life;
    const x = frame.x(p.x) * frame.dpr;
    const y = (frame.height - frame.y(p.y)) * frame.dpr;
    if (p.kind === "flash") hot.add(x, y, p.size * px * (0.7 + 0.5 * t), 1, 1, 0, rgb(p.colour), (1 - t) * 0.45);
    else if (p.kind === "fire" || p.kind === "flame") {
      const r = p.size * px * (p.kind === "flame" ? 1.3 - t * 0.6 : 0.85 + 1.0 * t);
      // Fire while it burns, then a puff of dark smoke.
      if (t < 0.72) hot.add(x, y, r, 1, 1, 0, fireColour(t), t < 0.5 ? 0.55 : 0.55 * (1 - (t - 0.5) / 0.22));
      else soft.add(x, y, r, 1, 1, 0, [0.2, 0.18, 0.17], 0.45 * (1 - (t - 0.72) / 0.28));
    } else if (p.kind === "ring") {
      // The ring of bent air is the last pass's; here it is only a faint light going out with it.
      hot.add(x, y, p.size * px * (1 - (1 - t) * (1 - t)), 1, 1, 0, rgb(p.colour), (1 - t) * 0.12);
    } else if (p.kind === "spark") {
      const fast = Math.hypot(p.vx, p.vy) || 1;
      hot.add(x, y, Math.max(1.5 * frame.dpr, 2.2 * px), Math.max(2, (p.size * 0.9) / 2.2), p.vx / fast, p.vy / fast, rgb(p.colour), 1 - t * t);
    } else if (p.kind === "chunk") {
      const turn = p.age * p.spin;
      soft.add(x, y, Math.max(1.2 * frame.dpr, p.size * px), 1, Math.cos(turn), Math.sin(turn), rgb(p.colour), t > 0.8 ? (1 - t) * 5 : 1, 1);
    } else if (p.kind === "smoke" || p.kind === "dust") soft.add(x, y, p.size * px * (0.7 + 1.5 * t), 1, 1, 0, rgb(p.colour), (p.kind === "dust" ? 0.5 : 0.6) * Math.pow(1 - t, 1.4));
    else if (p.kind === "glint") hot.add(x, y, Math.max(2 * frame.dpr, p.size * px * 1.6) * (1 - t * 0.5), 1, 1, 0, rgb(p.colour), 1 - t);
  };

  return {
    render(frame) {
      if (lost) return false;
      const w = Math.max(2, Math.round(frame.width * frame.dpr));
      const h = Math.max(2, Math.round(frame.height * frame.dpr));
      if (sized !== `${w}x${h}`) {
        sized = `${w}x${h}`;
        renderer.setSize(w, h, false);
        for (const t of [full, glowA, glowB]) t.dispose();
        full = target(w, h);
        glowA = target(Math.ceil(w / 3), Math.ceil(h / 3));
        glowB = target(Math.ceil(w / 3), Math.ceil(h / 3));
        size.set(w, h);
      }
      texture.image = frame.world;
      texture.needsUpdate = true;

      // What is burning, brightest first, as far as there is room for: where, how far it reaches, what colour and how strong.
      const burning = frame.fx.lights
        .map((l) => ({ l, strength: l.life > 0 ? (1 - l.age / l.life) * (1 - l.age / l.life) : 1 }))
        .sort((a, b) => b.strength * b.l.r - a.strength * a.l.r)
        .slice(0, LIGHTS);
      for (let i = 0; i < LIGHTS; i++) {
        const b = burning[i];
        if (!b) lights[i]!.set(0, 0, 0);
        else {
          lights[i]!.set(frame.x(b.l.x) * frame.dpr, (frame.height - frame.y(b.l.y)) * frame.dpr, Math.max(40, b.l.r * frame.scale * 1.3) * frame.dpr);
          tints[i]!.set(b.l.colour[0] * b.strength, b.l.colour[1] * b.strength, b.l.colour[2] * b.strength);
        }
      }
      // The rings of bent air: each goes out fast and then slower, and bends less as it goes.
      for (let i = 0; i < WAVES; i++) {
        const wave = frame.fx.waves[frame.fx.waves.length - 1 - i];
        if (!wave) waves[i]!.set(0, 0, 0, 0);
        else {
          const t = wave.age / wave.life;
          waves[i]!.set(frame.x(wave.x) * frame.dpr, (frame.height - frame.y(wave.y)) * frame.dpr, Math.max(30, wave.r * frame.scale * 1.4) * frame.dpr * (1 - (1 - t) * (1 - t)), wave.power * 16 * frame.dpr * (1 - t));
        }
      }
      last.material.uniforms.uWide!.value = 22 * frame.dpr;
      const [jx, jy] = frame.fx.jolt;
      (last.material.uniforms.uJolt!.value as THREE.Vector2).set(jx * frame.dpr, -jy * frame.dpr);

      // The show is drawn bigger than the game where the field is small on the screen, as on the 2D canvas.
      const px = Math.max(frame.scale * 1.5, 0.34) * frame.dpr;
      soft.begin();
      hot.begin();
      for (const p of frame.fx.bits) place(frame, p, px);
      soft.end();
      hot.end();

      try {
        // 1. The picture, lit, with the smoke and the fire over it.
        renderer.setRenderTarget(full);
        renderer.clear();
        renderer.render(sceneAll, camera);
        // 2. The fire alone, small.
        sceneHot.add(hot.mesh);
        renderer.setRenderTarget(glowA);
        renderer.clear();
        renderer.render(sceneHot, camera);
        sceneAll.add(hot.mesh);
        // 3, 4. Blurred across, then down.
        blur.material.uniforms.tFrom!.value = glowA.texture;
        blurStep.set(1 / glowA.width, 0);
        renderer.setRenderTarget(glowB);
        renderer.render(sceneBlur, camera);
        blur.material.uniforms.tFrom!.value = glowB.texture;
        blurStep.set(0, 1 / glowA.height);
        renderer.setRenderTarget(glowA);
        renderer.render(sceneBlur, camera);
        // 5. All of it, bent and shaken, on the screen.
        last.material.uniforms.tScene!.value = full.texture;
        last.material.uniforms.tGlow!.value = glowA.texture;
        renderer.setRenderTarget(null);
        renderer.render(sceneLast, camera);
      } catch {
        return false;
      }
      return !lost;
    },
    dispose() {
      for (const t of [full, glowA, glowB]) t.dispose();
      soft.dispose();
      hot.dispose();
      plane.dispose();
      texture.dispose();
      for (const mesh of [world, blur, last, soft.mesh, hot.mesh]) (mesh.material as THREE.Material).dispose();
      renderer.dispose();
    },
  };
}
