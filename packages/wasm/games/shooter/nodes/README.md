# The node builder

[BSP 5.2](https://github.com/cph6/bsp), the Doom node builder by Colin Reed, Lee Killough, Simon
Howard and Colin Phipps, compiled to WebAssembly. It works out, from a level's walls, the lumps the
engine draws and moves through the level with (SEGS, SSECTORS, NODES, REJECT, BLOCKMAP). The level
editor runs it after every change to a level's walls (`wad/nodes.ts`).

- `bsp/` is BSP's C as it is at commit `e17beb4` of <https://github.com/cph6/bsp>, unchanged.
  Left out: its build files, man page, test WADs and the DOS and Windows folders.
- `glue/config.h` is what BSP's configure script would have written for wasm32 and wasi-libc.
- `glue/nodes.c` exports one function, `nodes_build`, which calls BSP's `main` (renamed
  `bsp_main` by a define in `build.json`) with the words `bsp -q in.wad -o out.wad`.
- `nodes.wasm` is the result, committed; `nodes.wasm.json` is a hash of the C it came from.

BSP is under the GNU General Public License, version 2 or later (`bsp/COPYING`), and so is
`nodes.wasm`.

The REJECT lump it writes is all zeros: every room may see every other. That is always correct;
it only costs the engine a sight check it might have skipped.

To recompile: `npm run nodes -w @open-parlor/wasm`.
