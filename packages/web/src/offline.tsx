// Playing with no connection. The service worker (public/sw.js) keeps a copy of the app on this
// device, so everything that runs in the browser still starts: practice against the computer, the
// solitaires, the arcade, and a game shared on this device. What lives on the server (family tables,
// houses, the lobby, challenges, tournaments) needs the connection back, and the screens say so
// instead of offering a button that can only fail.
import { useEffect, useState, useSyncExternalStore } from "react";

const subscribe = (changed: () => void) => {
  addEventListener("online", changed);
  addEventListener("offline", changed);
  return () => {
    removeEventListener("online", changed);
    removeEventListener("offline", changed);
  };
};

/** Whether this device has a connection, as far as the browser can tell. */
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

/** What a setup screen says under its buttons while there's no connection. */
export const OFFLINE_LINE = "You're offline. Games on this device still work; playing with people elsewhere needs a connection.";

const TOLD = "cardroom.offline.told";

/** Ask the service worker whether a whole copy of the app is kept on this device. */
async function copyKept(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (!worker) return false;
  return new Promise((resolve) => {
    const done = (answer: boolean) => {
      navigator.serviceWorker.removeEventListener("message", heard);
      clearTimeout(timer);
      resolve(answer);
    };
    const heard = (event: MessageEvent) => {
      if (event.data && typeof event.data.offlineReady === "boolean") done(event.data.offlineReady);
    };
    const timer = setTimeout(() => done(false), 4000);
    navigator.serviceWorker.addEventListener("message", heard);
    worker.postMessage("offline-ready?");
  });
}

/** Already joining (or hosting) on this wifi: no need to offer it. */
const joining = () => new URLSearchParams(location.search).has("wifi");

/**
 * With no connection, a note at the foot of the screen saying what still works and offering to join
 * a game on this wifi; put away, it shrinks to a small one at the top. Otherwise, once, a small note
 * at the top of every screen: that there's no connection (and what still works), and,
 * once, that the games are now kept on this device.
 */
export function OfflineNotice() {
  const online = useOnline();
  const [ready, setReady] = useState(false);
  // The bigger note offering wifi play: once per time the connection goes, until it is put away.
  const [shut, setShut] = useState(false);
  useEffect(() => {
    if (online) setShut(false);
  }, [online]);
  useEffect(() => {
    let told = true;
    try {
      told = localStorage.getItem(TOLD) === "1";
    } catch {}
    if (told) return;
    let gone = false;
    let hide: ReturnType<typeof setTimeout> | undefined;
    // The copy is made in the background after the first visit: look now, and once more when a
    // worker takes over this page.
    const look = () =>
      void copyKept().then((kept) => {
        if (!kept || gone) return;
        try {
          localStorage.setItem(TOLD, "1");
        } catch {}
        setReady(true);
        hide = setTimeout(() => setReady(false), 6000);
      });
    look();
    navigator.serviceWorker?.addEventListener("controllerchange", look);
    return () => {
      gone = true;
      clearTimeout(hide);
      navigator.serviceWorker?.removeEventListener("controllerchange", look);
    };
  }, []);
  if (!online && !shut)
    return (
      <div className="offline-toast" role="status">
        <p>
          <strong><span aria-hidden>📴</span> No internet.</strong> Games on this device still work. Someone nearby can host a game on
          this wifi and you can join it, or host one from any game's page.
        </p>
        <div className="offline-toast-actions">
          {!joining() && (
            <button type="button" className="primary small" onClick={() => location.assign(`${location.pathname}?wifi=join`)}>
              📶 Join a game on this wifi
            </button>
          )}
          <button type="button" className="link" onClick={() => setShut(true)}>
            Not now
          </button>
        </div>
      </div>
    );
  if (!online)
    return (
      <p className="offline-note" role="status">
        <span aria-hidden>📴</span> Offline: games on this device still work
      </p>
    );
  if (ready)
    return (
      <p className="offline-note ready" role="status">
        <span aria-hidden>✓</span> Ready to play offline
      </p>
    );
  return null;
}
