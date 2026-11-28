// Finding your own face in your own camera, about a dozen times a second, so the others can pin
// your card to your forehead. It runs here, in this browser, on MediaPipe's face detector
// (BlazeFace, see scripts/face-model.py); what leaves the device is only where your forehead is.
//
// It is fetched the first time a game of Forehead starts, not with the app: the detector is
// eleven megabytes of WebAssembly, and isn't kept for playing offline (Forehead needs the internet).
import { FaceDetector } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import modelUrl from "./blaze-face-short-range.tflite?url";
import { foreheadOf, moved, settle, type Pose } from "./face";

/** How often to look, in ms. */
const EVERY = 80;
/** How many looks in a row with no face before saying so (about half a second). */
const MISSES = 6;
/** Say where the forehead is at least this often, so the others know it's still there. */
const HEARTBEAT = 1000;

async function detector(): Promise<FaceDetector> {
  const model = new Uint8Array(await (await fetch(modelUrl)).arrayBuffer());
  const make = (delegate: "GPU" | "CPU") => FaceDetector.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, { baseOptions: { modelAssetBuffer: model, delegate }, runningMode: "VIDEO", minDetectionConfidence: 0.5 });
  try {
    return await make("GPU");
  } catch {
    return make("CPU");
  }
}

/**
 * Track the face in `stream`, telling `onPose` where its forehead is (null when there's no face, or
 * the camera is off). Resolves to a function that stops it; rejects if the detector can't run here.
 */
export async function trackFace(stream: MediaStream, onPose: (pose: Pose | null) => void): Promise<() => void> {
  const faces = await detector();
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => {});

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pose: Pose | null = null;
  let sent: Pose | null = null;
  let sentAt = 0;
  let misses = 0;
  let last = -1;
  const say = (next: Pose | null) => {
    if (!moved(sent, next) && performance.now() - sentAt < HEARTBEAT) return;
    sent = next;
    sentAt = performance.now();
    onPose(next);
  };

  const look = () => {
    if (stopped) return;
    timer = setTimeout(look, EVERY);
    const camera = stream.getVideoTracks()[0];
    if (!camera || camera.readyState !== "live" || !camera.enabled) {
      pose = null;
      return say(null);
    }
    // A hidden tab: the others aren't sent anything new, and the battery is spared.
    if (document.hidden || video.readyState < 2 || !video.videoWidth) return;
    // The detector wants each frame's time to be later than the one before.
    const now = Math.max(performance.now(), last + 1);
    last = now;
    let found: Pose | null = null;
    try {
      const best = faces.detectForVideo(video, now).detections.sort((a, b) => (b.categories[0]?.score ?? 0) - (a.categories[0]?.score ?? 0))[0];
      const [right, left] = best?.keypoints ?? [];
      if (right && left) found = foreheadOf(right, left, video.videoWidth, video.videoHeight);
    } catch {}
    if (found) {
      misses = 0;
      pose = settle(pose, found);
      say(pose);
    } else if (++misses >= MISSES) {
      pose = null;
      say(null);
    }
  };
  look();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    video.srcObject = null;
    faces.close();
  };
}
