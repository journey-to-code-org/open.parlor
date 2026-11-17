// QR codes, both ways: drawn on the screen for another device's camera, and read with this one's.
// Reading uses the browser's own detector where it has one (Chrome on Android), and a decoder
// loaded only when it's wanted everywhere else.
import qrcode from "qrcode-generator";
import { useEffect, useMemo, useRef, useState } from "react";

/** The dark squares of a QR code for `text`: a square grid, true where a module is dark. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, "L");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => qr.isDark(row, col)));
}

export function QrCode({ text, label }: { text: string; label: string }) {
  const { path, size } = useMemo(() => {
    const modules = qrModules(text);
    // One path of unit squares, with the quiet border a reader needs around it.
    const quiet = 3;
    let d = "";
    modules.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x + quiet} ${y + quiet}h1v1h-1z`)));
    return { path: d, size: modules.length + quiet * 2 };
  }, [text]);
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
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
 * The camera, looking for a QR code. `onRead` is given each new code it sees and answers whether
 * that was the one wanted; a code that wasn't isn't offered again. With no camera (or no leave to
 * use it), it says so, and the code can be typed or pasted in the box the screen keeps beside it.
 */
export function QrScanner({ onRead }: { onRead: (text: string) => boolean | Promise<boolean> }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const read = useRef(onRead);
  read.current = onRead;
  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const refused = new Set<string>();
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setProblem("This browser can't use the camera here. Type or paste the code instead.");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        return setProblem("The camera isn't available (or wasn't allowed). Type or paste the code instead.");
      }
      if (stopped) return stream.getTracks().forEach((track) => track.stop());
      const frame = video.current!;
      frame.srcObject = stream;
      await frame.play().catch(() => {});
      const find = await reader();
      const look = async () => {
        if (stopped) return;
        const text = frame.videoWidth ? await find(frame, canvas) : null;
        if (stopped) return;
        if (text && !refused.has(text)) {
          if (await read.current(text)) return;
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
  }, []);
  return (
    <div className="qr-scan">
      {problem ? <p className="fine">{problem}</p> : <video ref={video} playsInline muted aria-label="The camera, looking for a QR code" />}
    </div>
  );
}
