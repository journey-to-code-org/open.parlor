/* @jsxImportSource solid-js */
// QR codes, both ways, for the Solid screens: drawn for another device's camera, and read with this
// one's (wifi/qrcore.ts does both; the React screens have the same in wifi/qr.tsx).
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { qrPath, scanQr } from "../../wifi/qrcore";

export function QrCode(props: { text: string; label: string }) {
  const drawn = createMemo(() => qrPath(props.text));
  return (
    <svg class="qr" viewBox={`0 0 ${drawn().size} ${drawn().size}`} role="img" aria-label={props.label} shape-rendering="crispEdges">
      <rect width={drawn().size} height={drawn().size} fill="#fff" />
      <path d={drawn().path} fill="#000" />
    </svg>
  );
}

/** The camera, looking for a QR code: `onRead` answers whether a code it saw was the one wanted. */
export function QrScanner(props: { onRead: (text: string) => boolean | Promise<boolean> }) {
  let video: HTMLVideoElement | undefined;
  const [problem, setProblem] = createSignal<string | null>(null);
  onMount(() => onCleanup(scanQr(() => video, (text) => props.onRead(text), setProblem)));
  return (
    <div class="qr-scan">
      <Show when={problem()} fallback={<video ref={video} playsinline muted aria-label="The camera, looking for a QR code" />}>
        <p class="fine">{problem()}</p>
      </Show>
    </div>
  );
}
