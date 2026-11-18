# Playing with no connection

Three things, in the order they were asked for: the games work offline, some of them can be shared
on one device, and several devices on the same wifi can play together when the internet is out.
The first two are built. The third has a first version, built to be tried on real phones: what it
does, what it doesn't yet, and what to check are at the end.

## Offline

The service worker (`packages/web/public/sw.js`) keeps a copy of the app on the device. The last
step of the web build (`scripts/precache.mjs`) writes the list of the app's files into it: 28 files,
6.2 MB today. The copy is made in the background on the first visit, and the page says "Ready to
play offline" once, when it is done.

| | Offline |
| --- | --- |
| Practice against the computer, every kit game, Spades and Palace | Yes. The computer players already think in the browser (and in a Web Worker for the heavy ones); the worker's file is in the copy. |
| The solitaires, the arcade games alone, Delbie's, Road to the Shootout | Yes. Scores and garages that are kept at a house wait for the connection. |
| Air Hockey, against the house or two at one screen | Yes. It is played on the device: two people share the screen, an end and a finger each. |
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

| Shared on one device, the screen facing whoever's move it is | Passed round, with a curtain between people | Not at all |
| --- | --- | --- |
| Chess, Checkers, Go, Reversi, Tic-Tac-Toe, Drop Four, Backgammon | Every turn-based card game: Hearts, Gin, Crazy Eights, Euchre, Hold'em, … | Speed, Slapjack, War (played at once, or against each other's speed) |
| Yacht, Pig, Ten Thousand, Ship Captain Crew, Shut the Box, Memory, Hangman | Combat (the fleets), Liar's Dice (the dice), Criss-Crosswords (the hands), Secret Word and Anagrams | Word Hunt (a race against the clock), Draw & Guess (needs guessers) |
| Mini Golf, Bowling, Billiards, Carrom, Shuffleboard, Crokinole, Flick Football | | Both Mahjongs (a call can come from anyone); Spades and Palace; the arcade and idle games |

**Passed round** (`passesDevice`, `kit/PassCurtain.tsx`): a game with something to hide can still be
played round one device. When the move passes from one person to the next, the whole screen is
covered ("Pass to Grammi"), and the table only shows again when the next person taps "I'm Grammi:
show me". Steps where everyone acts (passing cards in Hearts, moving on to the next hand) are taken
one person at a time, with the curtain between each.

A device lying flat between two people facing each other would rather the board did not turn: a
table setting for that would be small.

## One device shared, and other people on their own

Two people on one phone can play a third who is on a phone of their own. It is offered for the
games in the first column above, where the people at one screen see the same table anyway: Mini
Golf, Bowling, Billiards, Carrom, Shuffleboard, Crokinole, Flick Football, the board games, the dice games, Memory and Hangman.

**At a family table, an open table or a house's table** (`packages/web/src/second.ts`,
`RoomTable.tsx`). Once you have sat down, the seating screen has **Someone else at this device**:
type their name and press **Seat them here**, up to three more people. Each takes a seat of their
own, marked "at this device", and can stand up again before the game starts. Everyone else joins
from the link as usual. In the game the screen shows the table of whichever of the people here is
to move, by name ("Grammi: Pull back and let go"), stays put while someone elsewhere moves, and
has a switch in the banner for the times everyone may move at once. After a hole or a frame, one
press of "Next" moves everyone here on. A reload, or a phone that slept, comes back to all of its
seats.

How it works: a seat belongs to a browser, by its cookie, and a player holds one seat. The server
(`packages/server/src/second.ts`) treats a request to `/second/<n>/…` as the same request made by
somebody else, whose id is worked out from the browser's own and `n`. So the second person has a
seat, a view and moves through the very same routes, and the page keeps one more room open for
each of them. Only tables, their sync log and the lobby's "still here" are reached that way.

**On the same wifi** (`wifi/WifiHost.tsx`). The people chosen under **On this device** come to the
wifi table with the host: they share the host's screen, and the seats after theirs are for guests.

Not done:

- Games with hands to hide. Passed round with a curtain, they work on one device, but not yet with
  other devices at the table.
- A guest's device on the wifi seats one person. Only the host's can seat more.
- Spades, Palace and the arcade games.
- The chat is the device's own player's: the people beside them have no name of their own in it.

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

Works with no changes to the games. The server is one small Node process: on a laptop or a
Raspberry Pi, `npm start` (or the Docker image), and everyone opens the address it prints. Everything
works, houses and tournaments included, because it is the real server.

At start-up the server now prints where it is on the wifi, and in a terminal a QR code for it
(`packages/server/src/lan.ts`):

```
open.parlor on http://localhost:8787
on this wifi: http://192.168.1.20:8787
```

- Phones can't be the host; somebody needs a computer.
- No install, notifications or offline copy on the guests (not a secure address). None is needed
  while the server is in the room.

### Option B: one phone hosts in its browser, the others join by a QR code

Built, as a first version: `packages/web/src/wifi/`. The offline copy is what makes it possible:
the host's QR code is a link to the parlor's own address, which opens from the copy with no
connection.

1. With no internet, the host picks a game and **Play on this wifi** (the button only shows while the
   device is offline). The page makes a WebRTC offer with no ICE
   servers and shows it as a QR code of a link: `https://parlor…/?wifi=join#<offer>`.
2. A guest scans it with their camera, or with **Join a game on this wifi**, in the note that
   comes up at the foot of the screen while there is no internet. Their page
   makes the answer and shows it as a QR code.
3. The host taps **Scan their code** and points at it. The channel opens. Each more guest is the
   same two scans; computer players take the seats nobody did.
4. The host's page runs the game (`kit/LocalKit.tsx`, the practice table, with seats played over
   the channel): it applies everyone's moves and sends each guest their own seat's view, as the
   server does. A hand stays hidden from the other guests. (The host's device holds every hand;
   at a family table that is a matter of trust, as it is for whoever runs the server.)

It is every kit game, card games included, not only the ones that can share a screen.

What travels in a code (`wifi/signal.ts`) is only what the other browser can't guess: two ICE
secrets, the certificate's fingerprint and where the device listens on the network. That is about
130 characters, a link of about 170, and a QR code of 45 modules a side. With no internet a link
can't go by iMessage or WhatsApp, so both screens also show the code as text for AirDrop or Quick
Share.

Checked in Chrome, two separate browsers on one machine:

- Joined by link and pasted code, and by the camera (a fake camera shown the guest's QR code): the
  channel opens in under a tenth of a second.
- Chess played both ways; Gin, Hearts (two people and two computer players) and Mini Golf start on
  both screens, each seeing its own seat.
- After the join link is made, neither page asks the server for anything.
- The host leaving closes the guest's table with a message; a guest dropping shows on the host's.

**Not checked, and the reason this is a first version.** Only real devices will tell:

- **Two phones on a router with its internet unplugged.** Browsers hide local addresses behind
  `.local` names that are resolved by multicast on the wifi. That should work on a home router and
  on a phone's hotspot; a guest network, or a router with "client isolation", keeps devices apart
  and the join will fail with a message saying so.
- **iPhones.** Safari should take the rebuilt offer (it is a plain data-channel SDP), but it hasn't
  been tried. An app added to the home screen keeps its own offline copy apart from Safari's: a
  QR code scanned with the camera opens Safari, so on an iPhone "Join a game on this wifi" inside the app
  is the surer way.
- **Firefox** has long refused WebRTC when it believes it is offline.
- **Chrome's coming permission prompt** for WebRTC on the local network: probably one tap.

What it doesn't do yet:

- A guest who drops off comes back to the same seat (`wifi/WifiRejoin.tsx`): the host's table
  says who dropped and offers **Let Grammi back in**, which shows a new QR code for that seat; the
  guest taps **Scan the host's new code** on their "table has closed" screen, shows theirs back,
  and is sent the table as it stands. The same brings everyone back after the host's phone slept.
- The game ends if the host leaves (closes the page, or the browser drops it). The screen is kept
  awake while a table runs. Handing the game to a guest instead would mean every other guest
  pairing with the new host again, by QR code; it hasn't been built.
- Nothing is saved: no history, no scores to a house, no chat between devices, no table settings
  on a guest's screen, and Spades and Palace (which aren't kit games) aren't offered.
- A view is sent whole on every change, in one message (the limit is 256 KB). A long Mini Golf
  course is well inside it; a much larger game would want its views sent in pieces.

The fuller version of this is a second transport in open.rooms' client (a room over a data
channel instead of `/rooms` and the sync log), which would bring history, reconnecting and every
room feature with it. This version is what it takes to find out whether that is worth building.

### Option C: a real app

Wrap the parlor (Capacitor or Tauri) with the server inside it and Bonjour to find games on the
wifi: a "tables nearby" list, no QR codes, phones as hosts. It is also two app stores and native
code to keep. Not now.

### What doesn't work

Web Bluetooth can't make a phone the thing others connect to and isn't on iPhones. Web NFC is
Android only. Pointing the public page at a server on the wifi runs into mixed content and the
permission prompts above.

### What to try next

1. Two phones, the router's internet unplugged: host Chess on one, join from the other. Then the
   same on a phone's hotspot, and with an iPhone on either side.
2. If it holds: rejoining on real phones (built, checked in Chrome), and the host handing the game
   over when it leaves.
3. Then the data-channel transport in open.rooms, so a wifi table is a room like any other.
