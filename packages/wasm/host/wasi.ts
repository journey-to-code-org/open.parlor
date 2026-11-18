// The little of WASI a C program needs to believe it has a disk and a terminal: files held in
// memory under one folder ("/"), stdout and stderr handed to the page a line at a time, and exit.
//
// It is the set of calls the C library makes for stdio (fopen, fread, fwrite, fseek, remove,
// rename, mkdir), not all of WASI: no clocks, no directory listings, no sockets. A module that
// imports more than this fails to instantiate, which says what to add.

/** Thrown out of the module when the program calls exit(): nothing of it may be called after. */
export class Exit extends Error {
  code: number;
  constructor(code: number) {
    super(`the program exited with ${code}`);
    this.code = code;
  }
}

export interface WasiOptions {
  /** The disk: file contents by path, without the leading slash ("freedoom1.wad", "saves/0.dsg"). */
  files: Map<string, Uint8Array>;
  /** The module's memory. Asked for on every call, since growing it replaces the buffer. */
  memory: () => WebAssembly.Memory;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /** A file the program wrote has been closed, or renamed to here: the moment to keep it. */
  written?: (path: string, bytes: Uint8Array) => void;
  /** A file is gone (removed, or renamed away). */
  removed?: (path: string) => void;
}

const OK = 0;
const EBADF = 8;
const EEXIST = 20;
const EINVAL = 28;
const EISDIR = 31;
const ENOENT = 44;
const ENOTDIR = 54;

const O_CREAT = 1;
const O_DIRECTORY = 2;
const O_EXCL = 4;
const O_TRUNC = 8;
const FD_APPEND = 1;
const RIGHT_WRITE = 64n;

const CHARACTER_DEVICE = 2;
const DIRECTORY = 3;
const REGULAR_FILE = 4;

/** The one folder the program is given. */
const ROOT_FD = 3;

interface Open {
  path: string;
  /** May be longer than the file: writes grow it by doubling. */
  bytes: Uint8Array;
  length: number;
  position: number;
  append: boolean;
  dirty: boolean;
  directory: boolean;
}

/** "./saves//0.dsg" and "/saves/x/../0.dsg" are both "saves/0.dsg"; null if it climbs out of the root. */
function normalise(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

/** The imports for `wasi_snapshot_preview1`. */
export function wasi(options: WasiOptions): Record<string, (...args: never[]) => number | void> {
  const { files } = options;
  const folders = new Set<string>([""]);
  for (const path of files.keys()) for (let at = path.lastIndexOf("/"); at > 0; at = path.lastIndexOf("/", at - 1)) folders.add(path.slice(0, at));
  const open = new Map<number, Open>();
  let nextFd = ROOT_FD + 1;
  const decoder = new TextDecoder();
  const lines = { 1: "", 2: "" } as Record<number, string>;

  const view = () => new DataView(options.memory().buffer);
  const bytes = (at: number, length: number) => new Uint8Array(options.memory().buffer, at, length);
  const pathAt = (at: number, length: number) => normalise(decoder.decode(bytes(at, length)));

  function print(fd: number, chunk: Uint8Array) {
    const text = lines[fd] + decoder.decode(chunk);
    const whole = text.split("\n");
    lines[fd] = whole.pop() ?? "";
    const say = fd === 1 ? options.stdout : options.stderr;
    for (const line of whole) say?.(line);
  }

  /** Each (pointer, length) pair of an iovec array. */
  function* vectors(at: number, count: number) {
    const memory = view();
    for (let i = 0; i < count; i++) yield [memory.getUint32(at + i * 8, true), memory.getUint32(at + i * 8 + 4, true)] as const;
  }

  function keep(file: Open) {
    if (!file.dirty) return;
    const saved = file.bytes.slice(0, file.length);
    files.set(file.path, saved);
    options.written?.(file.path, saved);
    file.dirty = false;
  }

  return {
    fd_prestat_get(fd: number, out: number) {
      if (fd !== ROOT_FD) return EBADF;
      const memory = view();
      memory.setUint8(out, 0);
      memory.setUint32(out + 4, 1, true);
      return OK;
    },

    fd_prestat_dir_name(fd: number, out: number, length: number) {
      if (fd !== ROOT_FD || length < 1) return EBADF;
      bytes(out, 1)[0] = 0x2f;
      return OK;
    },

    fd_fdstat_get(fd: number, out: number) {
      const file = open.get(fd);
      if (fd > 2 && fd !== ROOT_FD && !file) return EBADF;
      const memory = view();
      memory.setUint8(out, fd <= 2 ? CHARACTER_DEVICE : fd === ROOT_FD || file?.directory ? DIRECTORY : REGULAR_FILE);
      memory.setUint16(out + 2, file?.append ? FD_APPEND : 0, true);
      memory.setBigUint64(out + 8, 0xffffffffffffffffn, true);
      memory.setBigUint64(out + 16, 0xffffffffffffffffn, true);
      return OK;
    },

    fd_fdstat_set_flags(fd: number, flags: number) {
      const file = open.get(fd);
      if (!file) return fd <= ROOT_FD ? OK : EBADF;
      file.append = (flags & FD_APPEND) !== 0;
      return OK;
    },

    path_open(dir: number, _dirflags: number, pathPtr: number, pathLength: number, oflags: number, rights: bigint, _inheriting: bigint, fdflags: number, out: number) {
      if (dir !== ROOT_FD) return EBADF;
      const path = pathAt(pathPtr, pathLength);
      if (path === null) return ENOENT;
      const file: Open = { path, bytes: new Uint8Array(0), length: 0, position: 0, append: (fdflags & FD_APPEND) !== 0, dirty: false, directory: false };
      if (folders.has(path)) {
        if (oflags & (O_CREAT | O_TRUNC)) return EISDIR;
        file.directory = true;
      } else {
        if (oflags & O_DIRECTORY) return files.has(path) ? ENOTDIR : ENOENT;
        const existing = files.get(path);
        if (existing && oflags & O_EXCL) return EEXIST;
        if (!existing && !(oflags & O_CREAT)) return ENOENT;
        const at = path.lastIndexOf("/");
        if (!folders.has(at < 0 ? "" : path.slice(0, at))) return ENOENT;
        if (existing && !(oflags & O_TRUNC)) {
          // Read in place (a WAD is tens of megabytes); the first write makes the file its own copy.
          file.bytes = existing;
          file.length = existing.length;
        } else {
          // Created or emptied: it exists from now, even if nothing is written.
          file.dirty = (rights & RIGHT_WRITE) !== 0n;
          files.set(path, file.bytes);
        }
      }
      const fd = nextFd++;
      open.set(fd, file);
      view().setUint32(out, fd, true);
      return OK;
    },

    fd_close(fd: number) {
      const file = open.get(fd);
      if (!file) return fd <= ROOT_FD ? OK : EBADF;
      keep(file);
      open.delete(fd);
      return OK;
    },

    fd_read(fd: number, iovs: number, count: number, out: number) {
      const file = open.get(fd);
      if (!file) return fd === 0 ? (view().setUint32(out, 0, true), OK) : EBADF;
      if (file.directory) return EISDIR;
      let total = 0;
      for (const [at, length] of vectors(iovs, count)) {
        const take = Math.min(length, file.length - file.position);
        if (take <= 0) break;
        bytes(at, take).set(file.bytes.subarray(file.position, file.position + take));
        file.position += take;
        total += take;
      }
      view().setUint32(out, total, true);
      return OK;
    },

    fd_write(fd: number, iovs: number, count: number, out: number) {
      const file = open.get(fd);
      if (!file && fd !== 1 && fd !== 2) return EBADF;
      if (file?.directory) return EISDIR;
      let total = 0;
      for (const [at, length] of vectors(iovs, count)) {
        const chunk = bytes(at, length);
        if (!file) print(fd, chunk);
        else {
          if (file.append) file.position = file.length;
          const end = file.position + length;
          if (end > file.bytes.length || !file.dirty) {
            const grown = new Uint8Array(Math.max(end, file.dirty ? file.bytes.length * 2 : file.length, 256));
            grown.set(file.bytes.subarray(0, file.length));
            file.bytes = grown;
          }
          file.bytes.set(chunk, file.position);
          file.position = end;
          file.length = Math.max(file.length, end);
          file.dirty = true;
        }
        total += length;
      }
      view().setUint32(out, total, true);
      return OK;
    },

    fd_seek(fd: number, offset: bigint, whence: number, out: number) {
      const file = open.get(fd);
      if (!file) return fd <= 2 ? 70 /* ESPIPE */ : EBADF;
      const from = whence === 0 ? 0 : whence === 1 ? file.position : whence === 2 ? file.length : -1;
      const to = from + Number(offset);
      if (from < 0 || to < 0) return EINVAL;
      file.position = to;
      view().setBigUint64(out, BigInt(to), true);
      return OK;
    },

    path_create_directory(dir: number, pathPtr: number, pathLength: number) {
      if (dir !== ROOT_FD) return EBADF;
      const path = pathAt(pathPtr, pathLength);
      if (path === null) return ENOENT;
      if (folders.has(path) || files.has(path)) return EEXIST;
      folders.add(path);
      return OK;
    },

    path_remove_directory(dir: number, pathPtr: number, pathLength: number) {
      if (dir !== ROOT_FD) return EBADF;
      const path = pathAt(pathPtr, pathLength);
      if (path === null || path === "" || !folders.has(path)) return ENOENT;
      folders.delete(path);
      return OK;
    },

    path_unlink_file(dir: number, pathPtr: number, pathLength: number) {
      if (dir !== ROOT_FD) return EBADF;
      const path = pathAt(pathPtr, pathLength);
      if (path === null || !files.delete(path)) return ENOENT;
      options.removed?.(path);
      return OK;
    },

    path_rename(fromDir: number, fromPtr: number, fromLength: number, toDir: number, toPtr: number, toLength: number) {
      if (fromDir !== ROOT_FD || toDir !== ROOT_FD) return EBADF;
      const from = pathAt(fromPtr, fromLength);
      const to = pathAt(toPtr, toLength);
      const moved = from === null ? undefined : files.get(from);
      if (from === null || to === null || !moved) return ENOENT;
      files.delete(from);
      files.set(to, moved);
      options.removed?.(from);
      options.written?.(to, moved);
      return OK;
    },

    proc_exit(code: number) {
      for (const fd of [1, 2]) if (lines[fd]) print(fd, new Uint8Array([0x0a]));
      for (const file of open.values()) keep(file);
      throw new Exit(code);
    },
  } as Record<string, (...args: never[]) => number | void>;
}
