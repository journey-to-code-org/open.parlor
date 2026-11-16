# Playing with no connection

Three things, in the order they were asked for: the games work offline, some of them can be shared
on one device, and what it would take for several devices on the same wifi to play together when
the internet is out. The first two are built. The third is an investigation, with a recommendation
at the end.

## Offline

The service worker (`packages/web/public/sw.js`) keeps a copy of the app on the device. The last
step of the web build (`scripts/precache.mjs`) writes the list of the app's files into it: 26 files,
4.3 MB today. The copy is made in the background on the first visit, and the page says "Ready to
play offline" once, when it is done.

| | Offline |
| --- | --- |
| Practice against the computer, every kit game, Spades and Palace | Yes. The computer players already think in the browser (and in a Web Worker for the heavy ones); the worker's file is in the copy. |
| The solitaires, the arcade games alone, Delbie's, Road to the Shootout | Yes. Scores and garages that are kept at a house wait for the connection. |
| A game shared on this device (below) | Yes. |
| Mini Golf courses and bowling lanes | The built-in ones. A course someone else shared has to have been loaded while online. |
| Family tables, Find players, houses, tournaments, challenges, watching, arcade "Play together" | No: these are rooms on the server. Their buttons are switched off while there is no connection, with a line that says why. |

How it behaves:

- **The page itself** is asked of the server first, so an update shows up at once; if the server
  hasn't answered in three seconds, or there is no connection, the kept copy is used.
- **The app's files** (`assets/`, icons, the manifest) come from the copy. Their names carry a hash,
  so a copy never goes stale; a new build makes a new copy, and the one before it is kept until the
  build after that, for pages still open on the older one.
- **Everything else is left alone**: `/rooms`, `/_zb`, `/houses` and the rest of the server, and the
  designer, watch, admin and embed pages, go to the network exactly as before.
- **The dev server** has an empty list, so nothing is cached while developing.
- A service worker needs a secure address: `https://` or `localhost`. Railway and GitHub Pages are.
  A parlor reached as `http://192.168.x.x:8787` is not, and gets no offline copy (see below; it
  doesn't need one).

Not done: the card designer and the watch page are separate apps and are not in the copy.

## One device, several people

`packages/web/src/kit/sameDevice.ts`. A practice table whose other seats are people. The setup
screen of a game that can be shared has **On this device**: just me, or two or more of us, with
computer players in any seats left over. The screen shows the table of whoever's move it is, by
name ("Grammi's turn"), and a chess board turns to face them a moment after the move lands. After a
hole, a frame or a game of a match, one press of "Next" moves everyone on.

It is offered only where there is nothing to hide, because one screen can't keep a secret from the
person holding it:

| Shared on one device | Not |
| --- | --- |
| Chess, Checkers, Go, Reversi, Tic-Tac-Toe, Drop Four, Backgammon | Every game with a hand of cards |
| Yacht, Memory | Combat (the fleets are hidden) |
| Mini Golf, Bowling, Billiards | Spades and Palace; the arcade and idle games |

Candidates for later: War, Kings Cup, Horse Race and Mahjong Shanghai have nothing hidden either.
A card game could be shared with a "hand the phone to Ann" curtain between turns; that is a
different table, and wasn't attempted. A device lying flat between two people facing each other
would rather the board did not turn: a table setting for that would be small.

## Several devices on the same wifi, with the internet out

### What a browser will and won't do

1. **A page can't be a server and can't look for other devices.** There is no API to listen for
   connections or to find "games nearby" on the network.
2. **WebRTC is the one way two browsers talk directly.** It needs an offer and an answer carried
   from one to the other once ("signalling"); on one network it needs no STUN or TURN server.
3. **The offline copy only exists for a secure address** (`https` or `localhost`), so the installed
   app on each phone is the one from the parlor's public address.
4. **A public page reaching into the local network is being fenced in.** Chrome asks the user's
   permission before a public site fetches from a local address (Chrome 142) or opens a WebSocket
   to one (Chrome 147), and has said WebRTC is next. Firefox is working on the same.

### What the parlor has going for it

A family table is a room: five pure functions (`setup`, `act`, `view`, `summary`, `bot`) run by
whoever holds the state. Practice already runs those same functions in the browser. So nothing
about the games has to change; the only question is which device holds the state and how the
others reach it.

### Option A: one computer on the wifi runs the parlor

Works today, with no code. The server is one small Node process: on a laptop or a Raspberry Pi,
`npm start` (or the Docker image), and everyone opens `http://<that computer's address>:8787`.
Everything works, houses and tournaments included, because it is the real server.

- Phones can't be the host; somebody needs a computer.
- No install, notifications or offline copy on the guests (not a secure address). None is needed
  while the server is in the room.
- Worth adding: the server printing its wifi address and a QR code for it at start-up, and a
  "Play on this wifi" page that shows the same. Small.

### Option B: one phone hosts in its browser, the others join by a link

This is the "share a link" idea, and it is feasible. The offline copy is what makes it possible:
a link to the parlor's own address opens the app from the copy with no connection.

1. The host opens a table "on this wifi". The page makes a WebRTC offer with no ICE servers and
   shows it as a link in a QR code: `https://parlor…/?join#<offer>`.
2. A guest scans it. The link opens their kept copy of the app, which makes the answer and shows
   it as a QR code (or a short code).
3. The host scans the answer. The channel opens, and stays open with no server anywhere.
4. The host's page runs the room: it applies moves and sends each seat its own view, as the server
   does. Hidden hands stay hidden from the other guests. (The host's device holds every hand; at a
   family table that is a matter of trust, as it is for whoever runs the server.)

One scan each way per guest. With no internet a link can't travel by iMessage or WhatsApp, so it
has to be a QR code, AirDrop or Quick Share, or a code read aloud.

Measured here, between two Chrome pages with no ICE servers and the offer and answer carried by
hand: the channel opened in 0.3 seconds. The full offer is 587 bytes; the part that actually has to
travel (two ICE secrets, the certificate fingerprint and one address) is about 150 to 200
characters, which fits a link and a small QR code comfortably.

Not proven yet, and only two real phones on a router with its internet unplugged will settle it:

- **Finding each other.** Browsers hide local addresses behind `.local` names, which are resolved
  by multicast on the wifi. That works on a home router and a phone hotspot; guest networks and
  "client isolation" block it. (In the sandbox this was written in there is no multicast, and the
  handshake failed for exactly that reason until the pages were online.)
- **Firefox** has long refused WebRTC when it believes it is offline. Chrome and Safari are the
  targets.
- **The permission prompt** Chrome plans for WebRTC on the local network: probably one "allow this
  site to find devices on your network" tap per device.
- **The host's phone sleeping or leaving** stops the table. The state can be handed to every guest
  as it changes, so another device could take over; that is more work.

What it would take: a second transport in open.rooms' client (a room over a data channel instead
of `/rooms` and the sync log), the room runner in the page (a worker, beside the bot worker), the
QR screens (showing is easy; scanning uses the camera, `BarcodeDetector` on Android and a small
decoder elsewhere), and reconnecting. Large, and mostly in open.rooms.

### Option C: a real app

Wrap the parlor (Capacitor or Tauri) with the server inside it and Bonjour to find games on the
wifi: a "tables nearby" list, no QR codes, phones as hosts. It is also two app stores and native
code to keep. Not now.

### What doesn't work

Web Bluetooth can't make a phone the thing others connect to and isn't on iPhones. Web NFC is
Android only. Pointing the public page at a server on the wifi runs into mixed content and the
permission prompts above.

### Recommendation

1. Do Option A's small polish now: the wifi address and a QR code at server start. It makes
   "the internet is out at the cabin" a solved problem for anyone with a laptop.
2. Before committing to Option B, a spike: Chess between two phones, joined by QR, on a router
   with no internet. Chess has two seats and nothing hidden, so it needs no rooms work, and it
   answers the questions above on real hardware.
3. If the spike holds, build the data-channel transport in open.rooms, and every game gets it at
   once, card games included.
