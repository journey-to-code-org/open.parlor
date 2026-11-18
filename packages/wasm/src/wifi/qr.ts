// QR codes, both ways: drawn on the screen for another device's camera, and read with this one's.
// Reading uses the browser's own detector where it has one (Chrome on Android), and a decoder
// loaded only when it's wanted everywhere else.
import qrcode from "qrcode-generator";

/** The dark squares of a QR code for `text`: a square grid, true where a module is dark. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, "L");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => qr.isDark(row, col)));
}

/** A QR code for `text`, as a picture for the page. */
export function qrCode(text: string, label: string): SVGSVGElement {
  const modules = qrModules(text);
  // One path of unit squares, with the quiet border a reader needs around it.
  const quiet = 3;
  const size = modules.length + quiet * 2;
  let path = "";
  modules.forEach((row, y) => row.forEach((dark, x) => dark && (path += `M${x + quiet} ${y + quiet}h1v1h-1z`)));
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "qr");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.innerHTML = `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/>`;
  return svg;
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
 * The camera, looking for a QR code, in `into`. `read` is given each new code it sees and answers
 * whether that was the one wanted; a code that wasn't isn't offered again. With no camera (or no
 * leave to use it), `into` says so, and the code can be typed or pasted instead. Gives back the
 * way to stop looking.
 */
export function scan(into: HTMLElement, read: (text: string) => boolean | Promise<boolean>): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const canvas = document.createElement("canvas");
  const refused = new Set<string>();
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.setAttribute("aria-label", "The camera, looking for a QR code");
  const problem = (text: string) => {
    const line = document.createElement("p");
    line.textContent = text;
    into.replaceChildren(line);
  };
  into.replaceChildren(video);
  void (async () => {
    if (!navigator.mediaDevices?.getUserMedia) return problem("This browser can't use the camera here. Type or paste the code instead.");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    } catch {
      return problem("The camera isn't available (or wasn't allowed). Type or paste the code instead.");
    }
    if (stopped) return stream.getTracks().forEach((track) => track.stop());
    video.srcObject = stream;
    await video.play().catch(() => {});
    const find = await reader();
    const look = async () => {
      if (stopped) return;
      const text = video.videoWidth ? await find(video, canvas) : null;
      if (stopped) return;
      if (text && !refused.has(text)) {
        if (await read(text)) return;
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
    into.replaceChildren();
  };
}
