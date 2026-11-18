// More than one person at this device, at a table on the server. The server gives the second
// person a seat of their own (its second.ts): everything this browser asks at /second/<n>/… is
// asked as that person. So the page keeps one more room open for each of them, beside its own,
// and plays whichever seat's move it is.
//
// Offered for games with nothing to hide (kit/sameDevice.ts: `sharesDevice`), where the people at
// one screen see the same table anyway. The others at the table are on devices of their own.
import { openRoom } from "@journey-to-code/rooms/client";

/** How many more people a device can seat beside its own player. The server allows no more. */
export const SECONDS = 3;

/** Where the `n`th extra person's requests go: nowhere special for 0, the device's own player. */
export const secondBase = (n: number) => (n > 0 ? `/second/${n}` : "");

/** The room as the `n`th extra person at this device sees it. */
export const secondRoom = <View = unknown, Move = unknown, Summary = unknown>(id: string, n: number) => openRoom<View, Move, Summary>(id, { base: `${secondBase(n)}/rooms`, sync: `${secondBase(n)}/_zb/sync` });
