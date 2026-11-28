# Forehead

A guessing game on a video call, for three to six. Everyone has a card on their forehead that the
others can read and they can't, and works out what it says from how the room treats them. Each
round has a host, who picks the round's game from a list and holds a buzzer for anyone who breaks
its rule.

It is at `?forehead=play`, with a tile on the front page's party shelf. Whoever starts a call sends
the others its link (`?forehead=join#<code>`) or shows its QR code.

## A round

1. The host picks the round's game from the list below. The server then deals every player a card,
   and each is sent everyone's card but their own.
2. On the call, each card sits on its player's forehead and follows it as they move (below). Your
   own shows `?` and one hint: the kind of card it is ("An animal", "Somebody at work").
3. Everyone plays up to everyone else's card by the round's rule, and types guesses at their own:
   three by default. A right guess is worth the guesses that were left (3, 2, 1).
4. The round ends when everyone has guessed right or run out, when the time is up (three minutes by
   default), or when the host ends it. The cards turn over.
5. The host moves on. The next round has a new host, the next player round the table, who picks
   its game. After the last round, the highest score wins, and that host can deal another game.

## The games a host picks from

All six are the same cards and the same guessing. What changes is how the room may play up to a
card. Each one's rule is shown to everyone for the whole round.

| | |
| --- | --- |
| 🏷️ **Who am I?** | Treat everyone the way you'd treat what's on their card |
| ❓ **Yes or no** | Take turns asking the room one yes-or-no question about yourself. The app says whose turn it is, on their tile. The turn passes when they press **I've asked**, when they guess, or when the host moves it on. Anyone may guess out of turn |
| 🤫 **Silent room** | Faces and hands only. Every microphone is switched off while the round is played, whatever its button says, and comes back when the cards turn over |
| 🔥 **Hot seat** | One player wears a card and everyone else is the room. It goes to whoever has sat in it least, starting after the host. The round ends as soon as they are done |
| 🙃 **Opposite day** | Treat everyone the opposite of the way their card says |
| ☝️ **One word** | One word at a time |

A new one is an entry in `MODES` (`forehead-game.ts`): a name, a rule, and whether it is `silent`,
played in `turns`, or has `one` wearer.

## Cards on foreheads

Each player's own browser finds their face in their own camera, about a dozen times a second, and
tells the others where their forehead is: four numbers (where, how wide, how tilted) over a small
WebRTC data channel beside the picture and sound. The others stand the card on that player's brow,
sized to the face and tilted with the head. No picture is sent anywhere for this, and nobody's
browser looks at anyone else's face.

- The detector is MediaPipe's BlazeFace (short range), through `@mediapipe/tasks-vision`. It runs
  on the graphics card where it can, and on the processor where it can't.
- It is fetched when a game starts, not with the app: about 3.3 MB compressed. It isn't kept for
  playing offline (`ONLINE_ONLY` in `scripts/packs.mjs`), since Forehead needs the internet anyway.
- A card goes back to the top of the tile when there's no face for half a second, when the camera
  is off, when nothing has been heard for 2.5 seconds, or for a player with no camera.
- **📌 Cards on foreheads** in the controls turns it off on that device: the player's face isn't
  tracked or sent, and every card on their screen sits at the top. It is remembered on the device.
  It also says when the face is still being found, or when the browser can't run the detector.
- A card's writing never gets smaller than 0.8rem, so on a small tile, a face far from the camera
  has a card bigger than its forehead.

The model in `packages/web/src/forehead/blaze-face-short-range.tflite` (Apache-2.0) is the one in
the npm package `@mediapipe/face_detection`, with the metadata MediaPipe Tasks needs added by
`packages/web/scripts/face-model.py`. The published Tasks copy is on Google's storage, which the
build can't reach.

## The buzzer

While a round is on, the host has a **Buzz** button on every other player's tile, for a player who
says a card out loud or breaks the round's rule.

- The buzzed player loses a point. Everyone hears the buzzer and sees who it was for.
- The host can say whose card was given away. That player is dealt a new card (unless they had
  already guessed theirs). "My own" is one of the choices: the host is wearing a card too.
- Nobody can buzz the host. The host changes every round, so everyone holds the buzzer in turn.

A host who drops off the call for 25 seconds is replaced by the next player who is there.

## How it fits together

| | |
| --- | --- |
| `packages/server/src/forehead-game.ts` | The rules, as plain functions over a state: the cards, the list of games, the deal, guesses, turns, the buzzer, the host's turn, and `view`, which is what one seat may see |
| `packages/server/src/foreheads.ts` | The rooms: seats and tokens, the long poll, the round's clock, who is there, and a mailbox for each seat's WebRTC handshakes |
| `packages/web/src/forehead/room.ts` | A player's side: the room as the server shows it, and a connection to every other player |
| `packages/web/src/forehead/Forehead.tsx` | The screen: the tiles and their cards, the guess, the clock, the buzzer |
| `packages/web/src/forehead/tracker.ts` | Finding this player's face in their camera |
| `packages/web/src/forehead/face.ts` | The sums: a forehead from the eyes, where it lands on a tile, smoothing, the wire format |

### The routes (`/foreheads`)

| | |
| --- | --- |
| `POST /foreheads {name}` | Open a room: its `code`, your `seat` and `token`, the ICE servers |
| `POST /foreheads/:code/join {name}` | Sit down. With `{seat, token}`, come back to your seat (a reload) |
| `POST /foreheads/:code/do {seat, token, action}` | `start`, `rules {rules}`, `pick {mode}`, `guess {text}`, `pass`, `buzz {player, spoiled?}`, `reveal`, `next`, `again`, `leave` |
| `POST /foreheads/:code/say {seat, token, to, message}` | A handshake for another seat |
| `GET /foreheads/:code/hear?seat&token&after&v` | Your handshakes after `after`, and the room if it has changed since `v`. Waits up to 20 s for either |

- Rooms live in memory, like Peekaboo's calls, and are forgotten an hour after everyone stops asking.
  A restart of the server ends the games in progress.
- It is not a kit game. The kit's games are in the `@journey-to-code/games` package, and a table's
  watch view and same-device seats assume a seat may see its own things. Here that is the one thing
  a seat may not see. The rules are five plain functions all the same, so moving them onto the kit
  later is a matter of wiring.

### The call

Every browser holds one WebRTC connection to each other player: a mesh, which is why six is the
most. Of any two players the one in the lower seat makes the offer; the other asks for one when it
arrives or its connection fails. The ICE servers are Peekaboo's: a STUN server, and the TURN server
from `CARDROOM_TURN_URL`, `_USERNAME` and `_CREDENTIAL` if they are set. Without a TURN server,
players on some mobile and office networks won't connect to each other.

### When the call won't connect

Each tile says how the call to its player is doing: "Connecting to Wife…", and after 15 seconds,
or if the browser gives up, "Can't connect to Wife" with **Try again** and **Why?**. Why? gives the
likely reason and the ways each device found to be reached: on this network, through the internet
(found with the STUN server), through a relay.

Two devices side by side on one wifi are the case most likely to need a relay. Some routers keep
devices on the wifi from reaching each other (a guest network, "client isolation", some mesh and
ISP routers), and many won't send a connection out to the internet and straight back in. With
no relay server, those calls can't connect. The fix is a TURN server, set on the parlor's server
with `CARDROOM_TURN_URL`, `CARDROOM_TURN_USERNAME` and `CARDROOM_TURN_CREDENTIAL` (Peekaboo's calls
use it too). Until then, one of the two phones on mobile data gets round it.

A browser that won't start the others' sound until the page is tapped gets a **Tap to see and hear
everyone** button.

The handshake messages to each player are sent one at a time, in order: sent side by side, an
address could reach the server before the offer it belongs to and be thrown away.

## The cards

237 of them, in six kinds: animals, jobs, things, food, places and people from stories. They are
kinds of thing, never a real person and never somebody else's character. None is dealt twice in a
game. A guess is matched without capitals, punctuation, "a" or "the", or a plural s, and a card can
have other answers that count ("fireman" for the firefighter).

## What was checked

- `packages/server/test/foreheads.test.ts` (30 tests): no seat's view holds its own card, over many
  deals and after a card is dealt again; nothing dealt twice; guesses and their points; the buzzer's
  rules; the host changing, picking, and being replaced; each kind of game (silence, turns, the hot
  seat going round); rooms, rejoining, the clock, handshakes going only to their seat.
- `packages/web/test/forehead.test.ts`: the clock, the line a buzz shows each reader, the placings,
  and the forehead sums (above the eyes, tilted with the head, cut to the tile, mirrored on your own,
  kept on the tile, and junk off the wire ignored).
- Three pages in headless Chrome with pretend cameras, through the dev server: all three saw and
  were seen by each other, each saw the others' cards and not their own, the host's buzz took a
  point and dealt a new card, a reload came back to the same seat with the call reconnected (from
  the lowest and the highest seat), and the buzzer moved to the next host in round two. A second
  run played a round of each of Silent room (every page's microphone track off, and on again at the
  reveal), Yes or no (the turn shown and passed) and Hot seat (one card, two rooms).
- Face tracking, in headless Chrome: the detector with this model found a drawn face in each part
  of the picture, its eyes where they were drawn, on both the processor and the graphics card. Then
  three players whose pretend cameras showed that face swaying and tipping: the cards found the
  faces within a second, followed them (compared with where the face was in screenshots, within a
  few percent of the tile, up to about 15% at the fastest sway), were mirrored on each player's own
  tile, and went back to the top when a player switched it off or turned their camera off, on the
  others' screens too. On that machine, with no graphics card, each look took about 120 ms.

## Not done

- **Not tried by people, on phones, or across real networks.** The Chrome run was three pages on
  one machine.
- Outside a silent room, nothing in the app stops a player saying a card or breaking the rule: the
  buzzer is the host's judgement.
- The games on the list all use the cards. Games of another kind (scenes, props, a song) aren't built.
- Face tracking hasn't been tried on a real face, a phone, or a real graphics card. With a drawn
  face swaying faster than people do, the card trails it a little and can slip over the eyes.
- One face per camera: two people sharing a phone get the more certain one.
- More than six would need an SFU in place of the mesh.
- Scores aren't kept after the game: no history, no house leaderboard, no chat.
- A game can't be joined once it has started, and nobody can watch one.
- No television screen for it. A Roku couldn't join the call in any case.
