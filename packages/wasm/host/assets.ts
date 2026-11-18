// A game's big files (a WAD is tens of megabytes), fetched once with a progress count and kept in
// the browser's Cache Storage, so the next visit starts at once and needs no connection.

const CACHE = "open-wasm-assets";

export interface AssetOptions {
  /** Told how much has arrived, and the total when the server says. */
  progress?: (received: number, total: number | null) => void;
  /** Whether these are the bytes expected: a server with no such file may answer with a page instead. */
  valid?: (bytes: Uint8Array) => boolean;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The file at `url`, from the copy kept here if there is one. A name ending in .gz is a gzipped
 * file: it is fetched and kept as it is (a third of the size, for a WAD) and unpacked each time.
 */
export async function asset(url: string, options: AssetOptions = {}): Promise<Uint8Array> {
  // Cache Storage only exists on a secure address (https or localhost); without it, just fetch.
  const cache = await (async () => (typeof caches === "undefined" ? null : caches.open(CACHE)))().catch(() => null);
  const kept = await cache?.match(url).catch(() => undefined);
  const packed = kept ? new Uint8Array(await kept.arrayBuffer()) : await download(url, options.progress);
  const bytes = await (url.endsWith(".gz") ? gunzip(packed) : Promise.resolve(packed)).catch(() => null);
  if (!bytes || options.valid?.(bytes) === false) {
    if (kept) await cache?.delete(url).catch(() => {});
    throw new Error(`${url} isn't the file it should be`);
  }
  // Kept under the address it came from: a new version of the file has a new address.
  if (!kept) await cache?.put(url, new Response(packed as BodyInit, { headers: { "Content-Type": "application/octet-stream" } })).catch(() => {});
  return bytes;
}

async function download(url: string, progress: AssetOptions["progress"]): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  // Content-Length is the compressed size when the server compresses on the way, so it is only a
  // total to count against when it doesn't.
  const length = response.headers.get("Content-Encoding") ? null : Number(response.headers.get("Content-Length")) || null;
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    progress?.(received, length);
  }
  const bytes = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

/** Drops kept files whose address isn't in `current`: older versions of a game's data. */
export async function forgetAssetsExcept(current: string[]): Promise<void> {
  try {
    const cache = await caches.open(CACHE);
    const keep = new Set(current.map((url) => new URL(url, location.href).href));
    for (const request of await cache.keys()) if (!keep.has(request.url)) await cache.delete(request);
  } catch {}
}
