// The node builder: works out, from a level's shape, the five lumps the engine draws and moves
// through it with (SEGS, SSECTORS, NODES, REJECT, BLOCKMAP). A level whose walls have changed
// can't be played until this has been run on it.
//
// The builder is BSP 5.2, a C program, compiled to WebAssembly (games/shooter/nodes) the way the
// engine is. It is run as it would be from a command line: a WAD goes on its disk, it writes
// another. A module is instantiated for each run, since BSP keeps its work in globals.
import { Exit, wasi } from "../host/wasi.ts";
import { encodeShape, LEVEL_LUMPS, type Shape } from "./level.ts";
import { type Lump, readWad, writeWad } from "./wad.ts";

interface Exports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  nodes_build(): number;
}

/** A WAD with every level in it built. Throws, with what BSP said, if a level can't be. */
export async function buildNodes(module: WebAssembly.Module, wad: Uint8Array): Promise<Uint8Array> {
  let exports!: Exports;
  const files = new Map([["in.wad", wad]]);
  const said: string[] = [];
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi({ files, memory: () => exports.memory, stderr: (line) => void said.push(line), written: (path, bytes) => void files.set(path, bytes) }) });
  exports = instance.exports as unknown as Exports;
  let code = 0;
  try {
    exports._initialize();
    code = exports.nodes_build();
  } catch (error) {
    if (!(error instanceof Exit)) throw error;
    code = error.code;
  }
  const out = files.get("out.wad");
  if (code !== 0 || !out) throw new Error(said.filter((line) => line.trim()).at(-1)?.replace(/^\s*(Error:\s*)?/, "") ?? "The level couldn't be built.");
  return out;
}

/**
 * A level's shape, built: a small WAD of everything of the level but what is placed in it, which
 * is what a "walls" change holds (mod.ts). `things` are the level's, which BSP wants to see.
 */
export async function buildLevel(module: WebAssembly.Module, name: string, shape: Shape, things: Uint8Array): Promise<Uint8Array> {
  const lumps = encodeShape(shape);
  const unbuilt: Lump[] = [{ name, data: new Uint8Array(0) }, { name: "THINGS", data: things }, ...(["LINEDEFS", "SIDEDEFS", "VERTEXES", "SECTORS"] as const).map((lump) => ({ name: lump, data: lumps[lump] }))];
  const built = readWad(await buildNodes(module, writeWad({ kind: "PWAD", lumps: unbuilt })));
  const of = new Map(built.lumps.map((lump) => [lump.name, lump.data]));
  const missing = LEVEL_LUMPS.filter((lump) => !of.get(lump)?.length && lump !== "REJECT");
  if (missing.length) throw new Error(`The level couldn't be built: it came back without ${missing.join(", ")}.`);
  return writeWad({ kind: "PWAD", lumps: LEVEL_LUMPS.filter((lump) => lump !== "THINGS").map((lump) => ({ name: lump, data: of.get(lump) ?? new Uint8Array(0) })) });
}
