// QR codes, both ways, for the React screens: drawn on the screen for another device's camera, and
// read with this one's. What they draw and how they read is qrcore.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import { qrPath, scanQr } from "./qrcore";

export { qrModules } from "./qrcore";

export function QrCode({ text, label }: { text: string; label: string }) {
  const { path, size } = useMemo(() => qrPath(text), [text]);
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
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
  useEffect(() => scanQr(() => video.current, (text) => read.current(text), setProblem), []);
  return (
    <div className="qr-scan">
      {problem ? <p className="fine">{problem}</p> : <video ref={video} playsInline muted aria-label="The camera, looking for a QR code" />}
    </div>
  );
}
