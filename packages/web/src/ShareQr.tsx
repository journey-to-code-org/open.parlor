// "Show a QR code" beside an invite: the link drawn big on this screen, for someone across the room
// to point their phone's camera at. The code's drawing (and its encoder) is fetched the first time
// it's asked for, not with the screen.
import { lazy, Suspense, useState } from "react";

const QrCard = lazy(() =>
  import("./wifi/qr").then(({ QrCode }) => ({
    default: ({ url, label, what }: { url: string; label: string; what: string }) => (
      <figure className="share-qr">
        <QrCode text={url} label={label} />
        <figcaption>{what}</figcaption>
      </figure>
    ),
  })),
);

export function ShareQr({ url, label, what }: { url: string; /** What a screen reader says the code is. */ label: string; /** The line under it. */ what: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide the QR code" : "Show a QR code"}
      </button>
      {open && (
        <Suspense fallback={<p className="fine">Drawing the code…</p>}>
          <QrCard url={url} label={label} what={what} />
        </Suspense>
      )}
    </>
  );
}
