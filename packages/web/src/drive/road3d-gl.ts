// The three.js half of the mountain road (see road3d.ts, which loads this on demand).
//
// The road is laid out once from its pieces: each has a bend and a grade, so walking along them
// gives a line through the world, and the tarmac, the rock face on your side, the rail and the
// slope on the other, the trees and the gas stations are all hung off that line. Cars are the
// strip's (strip3d-gl.ts), and so is the driver's seat, which here also has a mirror: the road
// behind is drawn a second time, small, and hung where a mirror goes.
//
// Scene units are metres. A place on the road is how far along it and how far across, with your
// own side of the road positive.
import {
  AmbientLight, BoxGeometry, BufferGeometry, Color, ConeGeometry, DirectionalLight, DoubleSide, Float32BufferAttribute, Fog, Group, HemisphereLight, InstancedMesh, Material, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, RepeatWrapping, Scene, SRGBColorSpace, Vector3, WebGLRenderTarget, WebGLRenderer,
} from "three";
import type { RoadFrame3d, Road3d } from "./road3d";
import { buildCar, buildCockpit, canvasTexture, glow, type Car } from "./strip3d-gl";

const STEP = 5;
const TRAFFIC: Record<string, { key: string; scale?: number }> = { sedan: { key: "custodian" }, wagon: { key: "estate" }, pickup: { key: "mule" }, van: { key: "caravel" }, hatch: { key: "sparrow" }, truck: { key: "caravel", scale: 1.3 } };
const PAINTS = ["#d8d4c8", "#7c8794", "#8a2f2f", "#2f4f7a", "#3c5a3e", "#c9a23a", "#1d1f24", "#9a6a3c"];

export function makeRoad3d(canvas: HTMLCanvasElement): Road3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  // Late afternoon: a low sun, long light, and haze where the road goes.
  scene.background = new Color(0xf0b98a);
  scene.fog = new Fog(0xf0c39a, 120, 900);
  const camera = new PerspectiveCamera(60, 1, 0.3, 2200);
  const rear = new PerspectiveCamera(38, 3.4, 0.5, 900);
  scene.add(new AmbientLight(0xfff0e0, 0.9), new HemisphereLight(0xbcd4ff, 0x6a5a44, 1.3));
  const sun = new DirectionalLight(0xffe0b0, 2.2);
  scene.add(sun);
  const mirrorTarget = new WebGLRenderTarget(384, 112);
  const world = new Group();
  scene.add(world);
  const shade = glow("rgba(0, 0, 0, 0.75)", "rgba(0, 0, 0, 0)");
  const noPool = glow("rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)");

  // The line of the road: a point every few metres, with which way it is heading.
  let px: number[] = [], py: number[] = [], pz: number[] = [], ph: number[] = [];
  let built = "";
  let mine: Car[] = [];
  let cockpit: ReturnType<typeof buildCockpit> | null = null;
  let mirror: Mesh | null = null;
  const traffic = new Map<number, Car>();
  const patrols: { car: Car; bar: MeshBasicMaterial[] }[] = [];
  let last = 0;
  let lean = 0;

  /** A place on the road in the world, and the way the road is heading there. */
  function at(along: number, across: number, up = 0): { x: number; y: number; z: number; h: number } {
    const f = Math.max(0, Math.min(px.length - 1.001, along / STEP));
    const i = Math.floor(f);
    const t = f - i;
    const h = ph[i]! + (ph[i + 1]! - ph[i]!) * t;
    return { x: px[i]! + (px[i + 1]! - px[i]!) * t + Math.cos(h) * across, y: py[i]! + (py[i + 1]! - py[i]!) * t + up, z: pz[i]! + (pz[i + 1]! - pz[i]!) * t + Math.sin(h) * across, h };
  }

  function dispose(o: { traverse: Group["traverse"] }) {
    o.traverse((child) => {
      const mesh = child as Mesh;
      mesh.geometry?.dispose?.();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) m.dispose();
    });
  }

  function build(frame: RoadFrame3d) {
    dispose(world);
    world.clear();
    traffic.clear();
    patrols.length = 0;
    const road = frame.road;
    const length = road.length / 1000;
    px = [];
    py = [];
    pz = [];
    ph = [];
    let x = 0, y = 0, z = 0, h = 0, piece = 0;
    for (let s = 0; s <= length + 300; s += STEP) {
      while (piece + 1 < road.pieces.length && road.pieces[piece + 1]!.at / 1000 <= s) piece++;
      px.push(x);
      py.push(y);
      pz.push(z);
      ph.push(h);
      const p = road.pieces[piece]!;
      h += (p.curve / 1_000_000) * STEP;
      x += Math.sin(h) * STEP;
      z -= Math.cos(h) * STEP;
      y += (p.grade / 1000) * STEP;
    }
    const half = road.halfWidth / 1000;
    const wall = road.wall / 1000 + 0.6;
    const drop = road.drop / 1000 - 0.4;

    /** A strip along the road between two offsets (and heights), as one mesh. */
    const ribbon = (a: [number, number], b: [number, number], material: Material, every = 1, repeat = 0) => {
      const pos: number[] = [];
      const uv: number[] = [];
      const index: number[] = [];
      let n = 0;
      for (let i = 0; i < px.length; i += every) {
        const hh = ph[i]!;
        for (const [off, up] of [a, b]) pos.push(px[i]! + Math.cos(hh) * off, py[i]! + up, pz[i]! + Math.sin(hh) * off);
        uv.push(0, repeat ? (i * STEP) / repeat : i, 1, repeat ? (i * STEP) / repeat : i);
        if (n) index.push(n * 2 - 2, n * 2 - 1, n * 2, n * 2, n * 2 - 1, n * 2 + 1);
        n++;
      }
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const mesh = new Mesh(geo, material);
      world.add(mesh);
      return mesh;
    };

    // Twelve metres of tarmac: a double yellow down the middle, a white line at each edge.
    const tarmac = canvasTexture(256, 256, (g) => {
      g.fillStyle = "#3a3a40";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(${i % 2 ? 255 : 0}, ${i % 2 ? 255 : 0}, ${i % 2 ? 255 : 0}, ${0.03 + ((i * 37) % 7) / 160})`;
        g.fillRect((i * 7919) % 256, (i * 104729) % 256, 2, 2);
      }
      g.fillStyle = "#e9e4d4";
      g.fillRect(6, 0, 5, 256);
      g.fillRect(245, 0, 5, 256);
      g.fillStyle = "#e3b62c";
      g.fillRect(123, 0, 3, 256);
      g.fillRect(130, 0, 3, 150);
    });
    tarmac.wrapS = tarmac.wrapT = RepeatWrapping;
    tarmac.anisotropy = 8;
    ribbon([half, 0], [-half, 0], new MeshStandardMaterial({ map: tarmac, roughness: 0.8, side: DoubleSide }), 1, 12);
    const dirt = new MeshStandardMaterial({ color: 0x8a7556, roughness: 1, side: DoubleSide });
    ribbon([wall, -0.02], [half, -0.01], dirt);
    ribbon([-half, -0.01], [drop, -0.02], dirt);
    // The rock face on your side, and the land above it.
    const rock = canvasTexture(256, 256, (g) => {
      g.fillStyle = "#7d6a58";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${i % 3 ? 40 : 210}, ${i % 3 ? 30 : 190}, ${i % 3 ? 20 : 160}, ${0.05 + ((i * 13) % 9) / 90})`;
        g.fillRect((i * 7919) % 256, (i * 104729) % 256, 6 + (i % 22), 2 + (i % 7));
      }
    });
    rock.wrapS = rock.wrapT = RepeatWrapping;
    ribbon([wall + 5, 16], [wall, 0], new MeshStandardMaterial({ map: rock, roughness: 1, side: DoubleSide }), 2, 24);
    ribbon([wall + 220, 40], [wall + 5, 16], new MeshStandardMaterial({ color: 0x5f6b3e, roughness: 1, side: DoubleSide }), 4);
    // The other side: a rail, then the slope down, then a long way away.
    ribbon([drop, 0.75], [drop, 0.35], new MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.5, metalness: 0.4, side: DoubleSide }));
    ribbon([drop - 1, -1], [drop - 70, -60], new MeshStandardMaterial({ color: 0x55633a, roughness: 1, side: DoubleSide }), 4);
    ribbon([drop - 70, -60], [drop - 900, -90], new MeshStandardMaterial({ color: 0x6f7c56, roughness: 1, side: DoubleSide }), 8);

    // Posts for the rail, and pines on both sides, placed by where they are and not by chance.
    const rnd = (i: number, k: number) => ((i * k * 9301 + 49297) % 233280) / 233280;
    const many = (count: number, geo: BufferGeometry, material: Material, place: (i: number) => [number, number, number, number] | null) => {
      const mesh = new InstancedMesh(geo, material, count);
      const m = new Matrix4();
      let n = 0;
      for (let i = 0; i < count; i++) {
        const p = place(i);
        if (!p) continue;
        const [along, across, up, size] = p;
        const w = at(along, across, up);
        m.makeScale(size, size, size).setPosition(w.x, w.y, w.z);
        mesh.setMatrixAt(n++, m);
      }
      mesh.count = n;
      world.add(mesh);
    };
    many(Math.floor(length / 8), new BoxGeometry(0.12, 0.8, 0.12).translate(0, 0.4, 0), new MeshStandardMaterial({ color: 0x6d5a45 }), (i) => [i * 8, drop, 0, 1]);
    const pine = new ConeGeometry(2.2, 9, 7).translate(0, 5.5, 0);
    const green = new MeshStandardMaterial({ color: 0x2f4a2c, roughness: 1 });
    many(Math.floor(length / 9), pine, green, (i) => [i * 9 + rnd(i, 3) * 6, wall + 9 + rnd(i, 7) * 60, 17 + rnd(i, 5) * 8, 0.8 + rnd(i, 11) * 0.9]);
    many(Math.floor(length / 7), pine, green, (i) => [i * 7 + rnd(i, 13) * 5, drop - 6 - rnd(i, 17) * 50, -6 - rnd(i, 19) * 38, 0.7 + rnd(i, 23) * 0.9]);

    // A gas station at the end of each leg, and a banner over the last one.
    const sign = (text: string, fill: string) =>
      canvasTexture(256, 96, (g) => {
        g.fillStyle = fill;
        g.fillRect(0, 0, 256, 96);
        g.fillStyle = "#fff";
        g.font = "700 60px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, 128, 50);
      });
    const steel = new MeshStandardMaterial({ color: 0x8a8f9a, roughness: 0.5, metalness: 0.5 });
    road.stations.forEach((station, i) => {
      const s = station / 1000;
      const end = i === road.stations.length - 1;
      const put = (mesh: Mesh, along: number, across: number, up: number) => {
        const w = at(s + along, across, up);
        mesh.position.set(w.x, w.y, w.z);
        mesh.rotation.y = -w.h;
        world.add(mesh);
      };
      for (const side of [drop + 0.3, wall - 0.3]) put(new Mesh(new BoxGeometry(0.25, 7, 0.25), steel), 0, side, 3.5);
      put(new Mesh(new BoxGeometry(wall - drop, 1.5, 0.2), new MeshBasicMaterial({ map: sign(end ? "FINISH" : "GAS", end ? "#c8323c" : "#1f6f4a") })), 0, (wall + drop) / 2, 7);
      if (!end) {
        put(new Mesh(new BoxGeometry(5, 0.3, 9), new MeshStandardMaterial({ color: 0xf2efe6 })), 8, half + 0.6, 4.4);
        for (const along of [5, 11]) {
          put(new Mesh(new BoxGeometry(0.3, 4.4, 0.3), steel), along, half + 2.6, 2.2);
          put(new Mesh(new BoxGeometry(0.5, 1.4, 0.7), new MeshStandardMaterial({ color: 0xc8323c })), along, half + 1.4, 0.7);
        }
      }
    });

    mine = road.drivers.map((_, seat) => {
      const car = buildCar(frame.cars[seat] ?? "sparrow", frame.tones[seat] ?? "#4cc9ff", noPool, shade);
      world.add(car.group);
      return car;
    });
    cockpit = buildCockpit(frame.tones[0] ?? "#4cc9ff");
    cockpit.rig.rotation.order = "YXZ";
    // The mirror: what the second camera sees, the right way round for a mirror.
    mirror = new Mesh(new PlaneGeometry(0.34, 0.1), new MeshBasicMaterial({ map: mirrorTarget.texture, fog: false }));
    mirror.scale.x = -1;
    mirror.position.set(0.3, 0.25, -0.5);
    cockpit.rig.add(mirror, new Mesh(new BoxGeometry(0.36, 0.12, 0.01), new MeshBasicMaterial({ color: 0x0b0c0f })).translateX(0.3).translateY(0.25).translateZ(-0.506));
    world.add(cockpit.rig);
  }

  /** Put a car on the road, pointing the way it is going. */
  function park(car: Car, along: number, across: number, speed: number, drift: number, dt: number, backwards = false) {
    const w = at(along, across);
    car.group.position.set(w.x, w.y, w.z);
    // It points down the road, plus however much it is crossing it.
    const yaw = Math.abs(speed) > 2 ? Math.atan2(drift, Math.abs(speed)) : 0;
    car.group.rotation.y = -(w.h + (backwards ? Math.PI - yaw : yaw));
    for (const wheel of car.wheels) wheel.rotation.z -= (Math.abs(speed) / 0.31) * dt;
  }

  return {
    render(frame) {
      const road = frame.road;
      const sig = `${frame.cars.join()}|${frame.tones.join()}|${road.length}|${road.pieces.length}|${road.pieces[1]?.curve}|${road.pieces[2]?.at}`;
      if (sig !== built) {
        built = sig;
        build(frame);
      }
      const dt = Math.min(0.05, last ? (frame.time - last) / 1000 : 0.016);
      last = frame.time;
      const inside = frame.seat === "cockpit";
      const me = road.drivers[0]!;

      road.drivers.forEach((d, seat) => {
        const car = mine[seat];
        if (!car) return;
        car.group.visible = d.staged;
        car.body.visible = !(inside && seat === 0);
        const speed = d.speed / 1000;
        const accel = dt > 0 ? (speed - car.speed) / dt : 0;
        car.speed = speed;
        car.pitch += (Math.max(-0.04, Math.min(0.05, accel * 0.005)) - car.pitch) * Math.min(1, dt * 8);
        car.body.rotation.x = car.pitch;
        // It leans out of a bend, and sits crooked once it has gone over or been wrecked.
        car.body.rotation.z = d.out === "edge" ? 0.6 : d.out === "wrecked" ? 0.08 : Math.max(-0.06, Math.min(0.06, -d.drift / 40000));
        park(car, d.along / 1000, d.across / 1000 + (d.out === "edge" ? -3 : 0), speed, d.drift / 1000, dt);
        if (d.out === "edge") car.group.position.y -= 2.5;
      });

      // The other cars: made as they come into view, and let go when they have gone.
      const seen = new Set<number>();
      for (const t of road.traffic) {
        seen.add(t.id);
        let car = traffic.get(t.id);
        if (!car) {
          const kind = TRAFFIC[t.kind] ?? TRAFFIC.sedan!;
          car = buildCar(kind.key, PAINTS[t.id % PAINTS.length]!, noPool, shade);
          if (kind.scale) car.group.scale.setScalar(kind.scale);
          world.add(car.group);
          traffic.set(t.id, car);
        }
        park(car, t.along / 1000, t.across / 1000, t.speed / 1000, 0, dt, t.speed < 0);
      }
      for (const [id, car] of traffic) {
        if (seen.has(id)) continue;
        world.remove(car.group);
        dispose(car.group);
        traffic.delete(id);
      }
      // The law: a black and white, with a bar of lights that takes turns when it is after you.
      while (patrols.length < road.patrols.length) {
        const car = buildCar("custodian", "#15171c", noPool, shade);
        const bar = [0xff2030, 0x2a5cff].map((colour, i) => {
          const m = new MeshBasicMaterial({ color: colour });
          const lamp = new Mesh(new BoxGeometry(0.5, 0.14, 0.24), m);
          lamp.position.set((i ? 1 : -1) * 0.3, 1.52, 0.1);
          car.group.add(lamp);
          return m;
        });
        const door = new Mesh(new BoxGeometry(1.74, 0.4, 1.3), new MeshStandardMaterial({ color: 0xf1efe8 }));
        door.position.set(0, 0.72, 0.1);
        car.group.add(door);
        world.add(car.group);
        patrols.push({ car, bar });
      }
      patrols.forEach((p, i) => {
        const seenNow = road.patrols[i];
        p.car.group.visible = !!seenNow;
        if (!seenNow) return;
        park(p.car, seenNow.along / 1000, seenNow.across / 1000, seenNow.lit ? 30 : 0, 0, dt);
        const blink = Math.floor(frame.time / 160) % 2;
        p.bar[0]!.color.setHex(seenNow.lit && blink ? 0xff2030 : 0x4a0d12);
        p.bar[1]!.color.setHex(seenNow.lit && !blink ? 0x3a6cff : 0x101c4a);
      });

      // The camera.
      const aspect = frame.width / Math.max(1, frame.height);
      const tall = aspect < 0.9;
      const along = me.along / 1000;
      const across = me.across / 1000;
      const speed = me.speed / 1000;
      const shake = frame.still ? 0 : Math.min(0.06, speed * 0.0008) + frame.jolt * 0.25;
      const jx = Math.sin(frame.time * 0.037) * shake;
      const jy = Math.sin(frame.time * 0.051) * shake;
      lean += (Math.max(-1, Math.min(1, me.drift / 2500)) - lean) * Math.min(1, dt * 5);
      const here = at(along, across);
      const fwd = new Vector3(Math.sin(here.h), 0, -Math.cos(here.h));
      const right = new Vector3(Math.cos(here.h), 0, Math.sin(here.h));
      camera.aspect = aspect;
      if (cockpit) cockpit.rig.visible = inside;
      if (inside && cockpit) {
        const eye = new Vector3(here.x, here.y + 1.1 + jy, here.z).addScaledVector(right, -0.36 + jx).addScaledVector(fwd, -0.25);
        const tilt = mine[0]?.pitch ?? 0;
        cockpit.rig.position.copy(eye);
        cockpit.rig.rotation.set(tilt * 0.8, -here.h, 0);
        cockpit.update({ rpm: me.rpm, redline: me.redline, mph: me.mph, gear: me.gear, auto: me.auto, boost: me.boost, heat: me.heat, oil: me.oil, afr: me.afr, spinning: me.squeal, blown: false }, frame.time, dt, true, frame.steer);
        camera.fov = (tall ? 84 : 64) + Math.min(8, speed * 0.1);
        camera.position.copy(eye);
        // Eyes go where the road goes.
        const ahead = at(along + 24, across * 0.6);
        camera.lookAt(ahead.x + right.x * lean * 1.5, eye.y - (tall ? 2.6 : 1.5) + tilt * 30 + (ahead.y - here.y), ahead.z + right.z * lean * 1.5);
        // The mirror first, with the inside of the car out of the way.
        cockpit.rig.visible = false;
        rear.position.set(eye.x, eye.y + 0.15, eye.z);
        const behind = at(Math.max(0, along - 40), across);
        rear.lookAt(behind.x, behind.y + 1, behind.z);
        renderer.setRenderTarget(mirrorTarget);
        renderer.render(scene, rear);
        renderer.setRenderTarget(null);
        cockpit.rig.visible = true;
      } else {
        const back = at(Math.max(0, along - (tall ? 11 : 9)), across * 0.75);
        camera.fov = (tall ? 70 : 52) + Math.min(14, speed * 0.2);
        camera.position.set(back.x + jx, back.y + (tall ? 4.4 : 3.4) + jy, back.z);
        const ahead = at(along + 14, across * 0.9);
        camera.lookAt(ahead.x, ahead.y - 0.6, ahead.z);
      }
      camera.updateProjectionMatrix();
      sun.position.set(here.x - 80, here.y + 70, here.z - 60);
      sun.target.position.set(here.x, here.y, here.z);
      sun.target.updateMatrixWorld();

      const w = Math.round(frame.width * frame.dpr);
      const h = Math.round(frame.height * frame.dpr);
      if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
      renderer.render(scene, camera);
      return true;
    },
    dispose() {
      dispose(scene);
      mirrorTarget.dispose();
      renderer.dispose();
    },
  };
}
