import { expect, test } from "vitest";
import { Exit, wasi } from "../host/wasi.ts";

const ROOT = 3;

/** The shim over a page of memory, with helpers to call it the way the C library does. */
function disk(files = new Map<string, Uint8Array>()) {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const out: string[] = [];
  const written: string[] = [];
  const calls = wasi({ files, memory: () => memory, stdout: (line) => out.push(line), written: (path) => written.push(path) }) as unknown as Record<string, (...args: (number | bigint)[]) => number>;
  const bytes = new Uint8Array(memory.buffer);
  const view = new DataView(memory.buffer);
  const text = (value: string, at: number) => {
    const encoded = new TextEncoder().encode(value);
    bytes.set(encoded, at);
    return [at, encoded.length] as const;
  };
  return {
    files,
    out,
    written,
    calls,
    open(path: string, oflags = 0, write = false) {
      const errno = calls.path_open!(ROOT, 0, ...text(path, 1024), oflags, write ? 64n : 0n, 0n, 0, 2048);
      return errno ? -errno : view.getUint32(2048, true);
    },
    write(fd: number, value: string) {
      const [at, length] = text(value, 4096);
      view.setUint32(3000, at, true);
      view.setUint32(3004, length, true);
      return calls.fd_write!(fd, 3000, 1, 3008);
    },
    mkdir: (path: string) => calls.path_create_directory!(ROOT, ...text(path, 1024)),
    rename: (from: string, to: string) => calls.path_rename!(ROOT, ...text(from, 1024), ROOT, ...text(to, 1536)),
    read(fd: number, length: number) {
      view.setUint32(3000, 8192, true);
      view.setUint32(3004, length, true);
      calls.fd_read!(fd, 3000, 1, 3008);
      return new TextDecoder().decode(bytes.slice(8192, 8192 + view.getUint32(3008, true)));
    },
  };
}

test("a file on the disk is read, from wherever it is sought to", () => {
  const d = disk(new Map([["game.wad", new TextEncoder().encode("IWAD-and-the-rest")]]));
  const fd = d.open("./game.wad");
  expect(d.read(fd, 4)).toBe("IWAD");
  d.calls.fd_seek!(fd, 9n, 0, 3016);
  expect(d.read(fd, 100)).toBe("the-rest");
  expect(d.open("missing.wad")).toBe(-44);
});

test("a file written is on the disk, and reported, once it is closed", () => {
  const d = disk();
  const fd = d.open("default.cfg", 1 | 8, true);
  d.write(fd, "mouse_sensitivity 5\n");
  expect(d.written).toEqual([]);
  d.calls.fd_close!(fd);
  expect(d.written).toEqual(["default.cfg"]);
  expect(new TextDecoder().decode(d.files.get("default.cfg"))).toBe("mouse_sensitivity 5\n");
});

test("writing to a file that was there doesn't change the bytes it was opened from", () => {
  const original = new TextEncoder().encode("aaaa");
  const d = disk(new Map([["save.dsg", original]]));
  const fd = d.open("save.dsg", 0, true);
  d.write(fd, "bb");
  d.calls.fd_close!(fd);
  expect(new TextDecoder().decode(original)).toBe("aaaa");
  expect(new TextDecoder().decode(d.files.get("save.dsg"))).toBe("bbaa");
});

test("folders are made before files go in them, and renaming moves a file", () => {
  const d = disk();
  expect(d.open("saves/0.dsg", 1, true)).toBe(-44);
  expect(d.mkdir("saves")).toBe(0);
  const fd = d.open("saves/temp.dsg", 1, true);
  d.write(fd, "saved");
  d.calls.fd_close!(fd);
  expect(d.rename("saves/temp.dsg", "saves/0.dsg")).toBe(0);
  expect([...d.files.keys()]).toEqual(["saves/0.dsg"]);
  expect(d.written).toEqual(["saves/temp.dsg", "saves/0.dsg"]);
  expect(d.open("../outside", 1, true)).toBe(-44);
});

test("stdout arrives a line at a time, and exit unwinds with its code", () => {
  const d = disk();
  d.write(1, "one\ntw");
  d.write(1, "o\n");
  expect(d.out).toEqual(["one", "two"]);
  expect(() => d.calls.proc_exit!(3)).toThrowError(Exit);
});
