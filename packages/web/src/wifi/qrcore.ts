// QR codes, both ways, with no framework: the squares of a code for `text`, drawn as one SVG path,
// and the camera looking for one. The squares come from @journey-to-code/symbology. Reading uses
// the browser's own detector where it has one (Chrome on Android), and a decoder loaded only when
// it's wanted everywhere else. The React screens use qr.tsx and the Solid ones solid/wifi/Qr.tsx,
// both on this.
import { loadQr, type Code } from "@journey-to-code/symbology";

const qr = await loadQr();

function grid(code: Code): boolean[][] {
  return Array.from({ length: code.size }, (_, row) => Array.from({ length: code.size }, (_, col) => code.modules[row * code.size + col] === 1));
}

/** The dark squares of a QR code for `text`: a square grid, true where a module is dark. */
export function qrModules(text: string): boolean[][] {
  return grid(qr.encode(text));
}

/** A QR code for `text` as an SVG path of unit squares, with the quiet border a reader needs around it. */
export function qrPath(text: string): { path: string; size: number } {
  const modules = qrModules(text);
  const quiet = 3;
  let d = "";
  modules.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x + quiet} ${y + quiet}h1v1h-1z`)));
  return { path: d, size: modules.length + quiet * 2 };
}

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorMaker = { new (options: { formats: string[] }): Detector; getSupportedFormats?(): Promise<string[]> };

/** A function that reads a QR code out of a frame, or null when there's none in it. */
async function reader(): Promise<(frame: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>> {
  const Maker = (globalThis as { BarcodeDetector?: DetectorMaker }).BarcodeDetector;
  if (Maker && (!Maker.getSupportedFormats || (await Maker.getSupportedFormats().catch((): string[] => [])).includes("qr_code"))) {
    const detector = new Maker({ formats: ["qr_code"] });
    return async (frame) => (await detector.detect(frame).catch(() => []))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import("jsqr");
  return async (frame, canvas) => {
    // Small enough to decode many times a second, big enough for a code held at arm's length.
    const scale = Math.min(1, 640 / Math.max(frame.videoWidth, frame.videoHeight));
    canvas.width = Math.round(frame.videoWidth * scale);
    canvas.height = Math.round(frame.videoHeight * scale);
    const pen = canvas.getContext("2d", { willReadFrequently: true })!;
    pen.drawImage(frame, 0, 0, canvas.width, canvas.height);
    const image = pen.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height)?.data || null;
  };
}

/**
 * The camera, looking for a QR code, into `video`. `onRead` is given each new code it sees and
 * answers whether that was the one wanted; a code that wasn't isn't offered again. With no camera
 * (or no leave to use it), `onProblem` says so. Returns what stops it.
 */
export function scanQr(video: () => HTMLVideoElement | undefined | null, onRead: (text: string) => boolean | Promise<boolean>, onProblem: (problem: string) => void): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const canvas = document.createElement("canvas");
  const refused = new Set<string>();
  void (async () => {
    if (!navigator.mediaDevices?.getUserMedia) return onProblem("This browser can't use the camera here. Type or paste the code instead.");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    } catch {
      return onProblem("The camera isn't available (or wasn't allowed). Type or paste the code instead.");
    }
    const frame = video();
    if (stopped || !frame) return stream.getTracks().forEach((track) => track.stop());
    frame.srcObject = stream;
    await frame.play().catch(() => {});
    const find = await reader();
    const look = async () => {
      if (stopped) return;
      const text = frame.videoWidth ? await find(frame, canvas) : null;
      if (stopped) return;
      if (text && !refused.has(text)) {
        if (await onRead(text)) return;
        refused.add(text);
      }
      timer = setTimeout(look, 150);
    };
    void look();
  })();
  return () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
  };
}
