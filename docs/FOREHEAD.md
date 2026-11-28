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
2. On the call, the others' cards are on their tiles. Your own tile shows `?` and one hint: the
   kind of card it is ("An animal", "Somebody at work").
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
- `packages/web/test/forehead.test.ts`: the clock, the line a buzz shows each reader, the placings.
- Three pages in headless Chrome with pretend cameras, through the dev server: all three saw and
  were seen by each other, each saw the others' cards and not their own, the host's buzz took a
  point and dealt a new card, a reload came back to the same seat with the call reconnected (from
  the lowest and the highest seat), and the buzzer moved to the next host in round two. A second
  run played a round of each of Silent room (every page's microphone track off, and on again at the
  reveal), Yes or no (the turn shown and passed) and Hot seat (one card, two rooms).

## Not done

- **Not tried by people, on phones, or across real networks.** The Chrome run was three pages on
  one machine.
- Outside a silent room, nothing in the app stops a player saying a card or breaking the rule: the
  buzzer is the host's judgement.
- The games on the list all use the cards. Games of another kind (scenes, props, a song) aren't built.
- The card sits on the tile, not on the forehead: no face tracking.
- More than six would need an SFU in place of the mesh.
- Scores aren't kept after the game: no history, no house leaderboard, no chat.
- A game can't be joined once it has started, and nobody can watch one.
- No television screen for it. A Roku couldn't join the call in any case.
