# Card Room

Family card and board games online: fifty-six games with house rules saved as presets, family
**houses** with their own tables, leaderboards and tournaments, computer players with personalities,
challenge links, and a widget that puts a game on any site, including [open.blog](https://github.com/journey-to-code-org/open.blog) ones.

Built first for Grammi and Grammi's House. Everything runs in one small server you can host
yourself (Docker or Railway), and practice games work anywhere, including the GitHub Pages build.

## The games

Spades and Palace have tables of their own; the other fifty-four are built on a shared game kit
(`packages/games`), so they all get the same setup screen, house rules editor, computer players,
houses, challenges and tournaments. The kit has three tables: one that draws any card game, one
that draws any board game (Tic-Tac-Toe is the first; Yacht's dice and scorecard are drawn by it
too), and one that draws any table sport on a canvas (Mini Golf is the first).

| Game | Players | |
| --- | --- | --- |
| Spades | 4, partners | Bid your tricks, spades are trump |
| Palace (Castle) | 2 to 6 | Get rid of every card; don't be the last one holding them |
| Hearts | 3 to 5 | Dodge the hearts and the queen |
| Oh Hell | 3 to 7 | Bid exactly what you'll take |
| Euchre | 4, partners | Partners, bowers and calling trump |
| Whist | 4, partners | Spades' grandparent: partners and tricks |
| Bridge | 4, partners | Contract bridge, Chicago scoring |
| Five Hundred | 4, partners | Partners bid tricks; the joker is boss |
| Pitch (Setback) | 2 to 6 | Bid for High, Low, Jack and Game |
| Pinochle | 4, partners | Partners, bidding, meld and tricks |
| Canasta | 4, partners | Partners, melds and canastas |
| Hand and Foot | 4, partners | Partners, books of seven, and a foot |
| Gin Rummy | 2 | Two players, melds and knocking |
| Rummy 500 | 2 to 6 | Melds, lay-offs and a pile to dig into |
| Contract Rummy | 3 to 8 | Seven rounds, seven contracts to lay down |
| Cribbage | 2 | Fifteen two, fifteen four, and a pair is six |
| Crazy Eights | 2 to 6 | Match the card; eights are wild |
| Switch (Last Card) | 2 to 6 | Uno's ancestor, with an ordinary deck |
| Fruit Salad | 2 to 8 | Our own colour-card game: match the fruit |
| Thirty-One | 2 to 8 | Three cards, one suit, as close to 31 as you dare |
| Durak | 2 to 6 | Attack, defend, and don't be the fool |
| Sevens | 3 to 7 | Build out from the 7s |
| Cuckoo | 3 to 10 | One card each; don't get stuck with the lowest |
| President | 3 to 7 | Climb from Scum to President |
| Golf | 2 to 6 | Swap your way to the lowest score |
| Go Fish | 2 to 6 | Ask for cards, make books |
| Old Maid | 2 to 6 | Pairs, and don't get stuck with her |
| Memory | 1 to 6 | Find the pairs (great for grandkids) |
| War | 2 to 4 | Flip, and the highest card takes all |
| Slapjack | 2 to 6 | Flip, and slap the jacks first |
| Speed | 2 | No turns: play faster than the other player |
| Kings in the Corner | 2 to 4 | Solitaire for the whole table |
| Spite and Malice | 2 to 4 | Race to play off your pile; kings are wild |
| Five Card Draw | 2 to 6 | Poker for chips: bet, swap, bet, show |
| Texas Hold'em | 2 to 6 | Two cards, five on the board, chips only |
| Bluff (Cheat) | 2 to 6 | Say what you're putting down, true or not |
| Liar's Poker | 2 to 6 | Bid poker hands hiding in everyone's cards |
| Blackjack | 1 to 5 | Get closer to 21 than the dealer (chips only) |
| Klondike Solitaire | 1 | The classic solitaire |
| FreeCell | 1 | Solitaire where every card is face up, with numbered deals |
| Spider | 1 | Two-deck solitaire: build runs from king to ace |
| Pyramid | 1 | Solitaire: clear pairs that make 13 |
| Ride the Bus 🍺 | 2 to 8 | Drinking game: guess, match, and don't ride the bus |
| Kings Cup 🍺 | 2 to 10 | Drinking game: every card has a rule |
| Horse Race 🍺 | 2 to 10 | Drinking game: bet sips on an ace |
| Drinking Pyramid 🍺 | 2 to 8 | Drinking game: remember your cards, match, bluff |
| Tic-Tac-Toe | 2 | A board game: three in a row, Ultimate's nine boards, or Gomoku's five in a row on 15×15 |
| Drop Four | 2 | A board game: drop discs down a rack, four in a row wins; bigger racks, Pop Out, five in a row |
| Combat | 2 | A board game: hide your fleet, then take turns calling shots. Classic, Admirals (ten ships that can't touch), Salvo, or a quick 7×7 |
| Reversi | 2 | A board game: trap their discs between yours and flip them, on 6×6, 8×8 or 10×10 |
| Checkers | 2 | A board game: American, International on 10×10 with flying kings, Russian, or friendly with no forced jumps |
| Go (Weiqi, Baduk) | 2 | A board game: surround more of the board than they do, on 9×9, 13×13 or 19×19, with Chinese or Japanese counting and handicaps |
| Chess | 2 | A board game: the whole of it, with a chess clock (bullet, blitz, rapid, a day a move), Chess960, and the moves written down as you play |
| Yacht | 1 to 6 | A dice game: five dice, three rolls and a scorecard to fill. The classic sheet, Yatzy's or a quick seven boxes, in turn or everyone at once; with drinking mode on it's Shotzee 🍺 |
| Backgammon | 2 | A board game: race your checkers home and hit theirs on the way. A friendly game, a money game with the doubling cube, a match to 3, 5 or 7 points, or Nackgammon |
| Mini Golf | 1 to 6 | A table sport: nine holes round a garden (a drainpipe, a pond, toadstools that kick, a mole's tunnels), in turn with balls that knock into each other, or everyone at once |

Poker and Blackjack are for chips only: everyone starts with the same stack, and the chips are
just for keeping score.

The 🍺 games are drinking games for adults (water counts). Party games (Thirty-One, President,
Bluff, Liar's Poker, Durak, Slapjack, Sevens, Cuckoo) also have a drinking-mode house rule, off
unless a table turns it on. Kids' games have none. Drop Four's drinking mode is a shot clock: once
the other player's disc lands you have three seconds to drop yours, or you take a drink and lose
your turn. Yacht's drinking mode is a table called Shotzee: roll five of a kind and everyone else
takes a shot; put a zero on your scorecard and you drink.

## Backgammon

The board is the kit's first track of points: twenty-four long triangles, the bar and a tray each.
On a phone held upright it is laid on its side, so every point is a strip a thumb can hit, with
your home board still nearest you on the right. Tap a checker and the points it can reach light
up; tap one (or drag the checker there). A turn is a roll and then a checker a die, and until it
is over **Undo** takes your moves back. A roll that can't be played passes by itself. Two table
rules change the pace: **Finish each turn with Done** keeps the turn yours until you say so, and
**One tap moves** plays a checker that has only one place to go as soon as you touch it.

- **The opening roll.** Each player throws one die; the higher goes first with those two dice,
  and a tie is thrown again.
- **The cube.** Before rolling, the player whose turn it is may offer to double if the cube is
  in the middle or on their side. The other player takes (the stakes double and the cube is
  theirs) or drops and loses the game at the stakes as they stood. The board shows the cube,
  what it is on, and whose side it is on.
- **Friendly** is one game with no cube. **Money game** is one game with the cube, scored in
  points, with the **Jacoby rule** (gammons and backgammons only count once the cube has been
  turned) and, as an option, **automatic doubles** (a tied opening roll doubles the stakes, once).
- **Match to 3, 5 or 7** (9 and 11 are in the rules editor) carries the score across games, with
  the **Crawford rule**: in the first game after a player comes within a point of the match,
  nobody may double. A game scores the cube times one, two (a gammon: the loser has borne off
  nothing) or three (a backgammon: and still has a checker on the bar or in the winner's home
  board). On a leaderboard or in a tournament a win is a win, whatever it was won for.
- **Nackgammon** starts with two more checkers back (two each on the 24 and 23 points).

The computer players judge every whole turn their dice allow with a hand-written judgement, not a
trained one: the race, how many of the other side's 36 rolls hit each blot and what that would
cost, points and runs of points, anchors, the home board against a checker on the bar, and a pip
count with the usual corrections once the two sides have passed each other. On Hard they also
look at your best answer to each of the 21 rolls for their best few turns. The cube follows the
8-9-12 rule in a race (double from 8% ahead, redouble from 9%, take up to 12% behind) and the
judged chance of winning otherwise. They have no bear-off tables, no opening book and only a
rough idea of match scores (they know the cube is dead once it already wins them the match, and
that the player behind after the Crawford game has nothing to lose by doubling at once), so a
good club player will beat them.

There is no resigning yet, and no beavers.

## Go

Go is called Weiqi in China and Baduk in Korea; it is the same game. Stones go on the crossings of
the lines, a group with no empty crossing beside it is captured, and a table picks its board (9×9
to learn on and for a phone, 13×13, or the full 19×19) and its rules:

- **Counting.** *Chinese (area)*, the default: your stones on the board plus the empty points only
  you surround, and White gets 7.5 (komi) for moving second. *Japanese (territory)*: the empty
  points only you surround plus the stones you captured, and White gets 6.5. The komi is a house
  rule; a whole number allows a drawn game.
- **Ko.** By default the board may never be put back the way it has been before in the game
  (positional superko). The house rule "simple ko" only stops a stone being taken straight back.
  Suicide is not allowed unless a table switches it on.
- **Handicap.** Two to nine stones for Black on the star points, with White moving first and
  getting half a point; "just no komi" is the smallest handicap. Who plays Black is the luck of the
  draw unless a table says (by custom, the less experienced player).
- **The count.** When both players pass, play stops. The game proposes which stones are dead (it
  plays the position out a hundred or so times and sees which groups don't survive), shows them
  faded with each side's territory tinted and the score running in the bar, and either player may
  tap a group to change it. The count stands when both press **Agree**; a changed marking has to
  be agreed afresh. **Play on** goes back to the board instead, with the other player to move:
  capturing the stones is the one answer nobody can argue with. A computer player agrees to the
  game's own marking, or to any that costs it nothing; against one that does, it plays on, once,
  and after that lets the marking stand (it can be wrong, and you are not held at the board).
- **Where this is simpler than the real Japanese rules.** Nothing is ruled dead or alive by the
  book: seki, bent four in the corner and the like are whatever the two players agree in the
  count. Points inside a seki are counted like any others, there are no pass stones, and a
  handicap adds no compensation under Chinese counting.

Resigning is under ⚑, and is how most games of Go end. The same menu offers a draw and a move
taken back; a table that wants neither sets the house rule Offers to "Neither".

**On a phone**, the full board's crossings are about 18 pixels apart, closer than a finger is
wide. There a stone takes two taps: the first shows it, see-through, with gold lines along its row
and column, and it can be nudged with the arrows under the board; tapping it again, or **Play**,
puts it down. ⚙︎ has "Putting a stone down" (two taps only when the crossings are small and the
screen is touched, always two, or always one) and whether the coordinates are drawn. With a
keyboard the arrow keys walk the crossings and Enter plays; each is read out ("Q16: white stone,
last move").

**The computer player** is our own: Monte Carlo tree search over quick playouts, on an engine
that keeps each group's liberties as stones come and go (`packages/games/src/goboard.ts`). On 9×9
it is a sensible opponent: Hard should give a beginner a real game, and Easy plays half its moves
without reading and can be beaten by someone who has learnt to capture and to surround. On 13×13
and 19×19 it is weak. It knows the basics (take stones in atari, save its own, don't fill its own
eyes, play near what is on the board and on the third and fourth lines early, pass when the game
is over) but an experienced player will beat it easily. Its think is rationed in playouts for each
millisecond the table grants, so the same dice give the same move on any machine quick enough,
and it stops at three quarters of its budget whatever it has done. It never resigns.

## Holding your hand

Above your cards is a small sort bar. **Suits** groups them by suit and **Ranks** lines them up
in one run with the suits mixed; the button beside them flips between high to low (A → 2) and low
to high (2 → A). **Auto** (every game but Spades, which already deals by suit) is the game's own
order. The choice is remembered on the device, one per game.

Or drag a card to wherever you want it: that's **Mine**, your own order for the hand. On a phone,
drag sideways; in a hand too big for the screen (which scrolls), hold a card for a moment first.
With a keyboard, Alt + ← / → moves the card you're on. New cards join at the right-hand end, and
the next deal goes back to the sort you chose. It's only how your screen shows your hand; nobody
else sees it.

## The turn timer

A table on the server can give everyone a time limit for each move: **15 seconds, 30 seconds, 1
minute, 2 minutes or a day**. It's off unless someone turns it on, in the lobby or under ⚙︎ at the
table, and anyone seated can change it mid-game. When a person's time runs out, the game's own
computer player makes that one move for them, at the table's level, so a phone left on the sofa
doesn't stop the game for everyone else; they play their next move themselves. The seat whose
clock is running shows the time left, and your own gives a soft tick and a buzz five seconds
before the end.

- The clock is on whoever the table is waiting for: the player whose turn it is, or, when
  everyone moves at once (passing cards in Hearts, Palace's swap, "Deal the next hand"), the first
  person who still owes a move. In those phases it counts from the last move anyone made.
- Computer players keep their own time, a race (Speed, a slap in Slapjack) has no clock, and
  neither does a game for one. In Mini Golf the timer's move is a putt: the computer player's aim.
  In Yacht it is one step of a turn (a roll, a die kept back, a box filled in), so a turn left to
  the timer takes a few of them; the same goes for a roll and each checker in Backgammon.
- The server keeps the time, and it survives a restart (see [Clocks and deadlines](#clocks-and-deadlines)).
  "A day" is for games played a move at a time over a week.
- Practice games on your own device have no timer: nobody is waiting on you.
- A game can have a clock of its own as well, which is part of its rules and not a table setting
  (Drop Four's shot clock in drinking mode). When both are running, whichever runs out first counts.
  A game's own clock runs in practice too.

## Resigning, draws and taking a move back

At a board game for two (Tic-Tac-Toe, Drop Four, Reversi, Checkers, Chess, Go, Combat) the ⚑ in the bar has
the things a player rarely does:

- **Resign.** Any time a game is on, your turn or not, and it asks again before it's sent. The
  other player wins that game. In a match of several games it gives up the game on the board, not
  the match.
- **Offer a draw.** The other player gets a banner with Accept and Decline. The offer stays open
  while you move, and playing on is a "no": it lapses when they make their move. You can't offer
  again until six moves have been made, so it can't be used to nag. An agreed draw counts on the
  leaderboard and in a tournament exactly as a draw on the board does.
- **Ask to take a move back.** If they say yes, your last turn is undone (a whole run of jumps in
  Checkers), and their reply to it if they have already moved. It lapses when anybody moves.
  There is no taking back in Combat (a shot tells you something that can't be un-known), against
  Drop Four's shot clock, or in a tournament match.

Computer players answer at once: they always let you take a move back, take a draw when they're
behind (or level, once the game is well along), and never offer or resign themselves. A house
rule, **Offers**, says what a table allows: draws and take-backs, draws only, or neither
(resigning is always allowed). Someone watching sees the offer and how it came out, with nothing
to press. Offers don't stop a clock: the turn timer and a game's own clock run on through them,
and a turn timer that runs out plays a move for you, never an answer.

There is no notification for an offer when you're away from the table, because there is none for
"your move" either; the turn timer is what keeps a game from waiting on you.

## Chess

Chess is on the board kit like the other board games, and is the first to use three things in it:
a clock that is part of the game, a record of the moves, and a set of pieces drawn by the table.

- **The rules, all of them.** Check, mate and stalemate; castling either side; en passant;
  promotion to whatever you choose (a small chooser opens on the square, queen first). A draw can
  be claimed with a button when the same position has come up three times or after fifty moves
  each without a capture or a pawn move, and is automatic at five times or seventy-five moves, or
  when neither side has enough left to mate. Draws by agreement and resigning are the ⚑ menu's.
  The move generator is checked against the published perft counts (the start to depth 5,
  "Kiwipete" and four more, and two Chess960 positions).
- **Clocks.** Presets for Bullet 1+0, Blitz 3+2 and 5+0, Rapid 10+0 and 15+10, and any minutes
  and increment you like as house rules; no clock unless a table picks one. Each side's time runs
  down on its own turn from White's first move, the increment is added after each move, and
  running out loses (or draws, if the other side has nothing it could mate with). It is the
  server's clock: a game's `deadline` is the bank of the side to move, each move is logged with
  its time, and a restart replays the banks exactly. Both clocks are shown at the seats and count
  down by the server's time. An offer doesn't stop the clock, and a move can't be taken back on
  one. Computer players are on the clock too: they think for a share of what they have left, and
  lose on time like anyone if their move doesn't come.
- **Correspondence** is its own preset: a day (or two, three, a week) for each move, and running
  out loses. That is a rule of the game, so it is the game's own deadline; the table's turn
  timer set to "a day" is the friendlier version, where the computer makes the move for you.
- **Notation.** The moves are written in standard algebraic notation under the board as they are
  played. ◀ and ▶ (or the arrow keys) step back and forward through the game, while it is on and
  after it ends; the board shows that position and takes no moves until you come back. **Copy
  PGN** puts the whole game on the clipboard. The engine reads and writes FEN (`chessFromFen`,
  `chessFen` in `packages/games/src/chess.ts`).
- **Chess960.** A preset: one of the 960 starting rows, drawn by lot, the same for both sides and
  kept for a pair of games in a match so each player has it with each colour. Castling ends where
  it does in classic chess; you castle by putting your king on your rook.
- **The pieces** are our own, drawn as SVG in `packages/web/src/board/pieces.tsx` and keyed by
  the `kind` the engine gives ("knight"), so they are the same on every phone. "Show where a piece
  can go" is a house rule, on unless a table turns it off.
- **The computer player** is our own engine (`packages/games/src/chesscore.ts`): iterative
  deepening alpha-beta with a transposition table, quiescence search, null-move pruning and the
  usual move ordering, over an evaluation of material, piece placement, pawn structure, king
  shelter and mobility. No opening book: it varies its openings with a little luck among moves
  it thinks are about as good. Easy looks two moves ahead and often plays the move that looks
  best without looking at all (so it leaves pieces hanging); medium looks four and rarely slips,
  and never into mate on the move; hard looks as far as it can (five or six moves in a
  middlegame at a table without a clock, about eight on a blitz clock, on the machine it was
  measured on). It is a club player at best, not a master: it has no endgame tables, knows
  nothing of fortresses, and a patient person will outplay it in a quiet position.

  Without a chess clock its thinking is rationed by work (positions looked at, fifty for
  each ms of the table's budget), so the same position always gets the same move on any machine;
  on a chess clock it thinks by the time, and always stops inside the budget it was given.

## Finding people to play with

A family table is private: only people with its link can sit down. Two things make a table public.

- **Find players**, on any game's setup screen, seats you at an open table that's waiting for that
  game (tables with your rules first, then whichever has waited longest). If nobody's waiting, it
  opens a table with your rules and you wait there. Turn on **Only tables with my rules** and it
  takes a seat only where the rules and the table size are exactly yours. Anyone seated at a family
  table can also open it to everyone, or close it again.
- **Open tables**, from the front page, lists every table that's waiting, whatever the game: who's
  there, how many seats are left, the rules, and how long it's waited. Jump into any of them.

An open table deals itself when its last seat is taken (add bots if you're tired of waiting).
Leaving before the deal gives your seat back, and a seat whose player has gone quiet for a minute
and a half is freed, so the list only shows tables somebody is really waiting at.

Open tables are where strangers meet, so:

- **The host can remove a player**, before the deal or after it (the host is whoever opened the
  table, or the first seat once they've left). Before the deal the seat is free again; after it, a
  computer player takes the seat and plays on. Either way that player can't come back to the table.
- **The host can mute a player**, and anyone can hide someone's chat on their own device. Both are
  under ⚙︎ at the table. Crude words in an open table's chat are covered up.
- **Names are filtered.** The crudest names are turned away from open tables, and one that came in
  by a table's link shows as "Player". The list is short on purpose; add your own words with
  `CARDROOM_BLOCKED_NAMES`.
- **A buzz when someone's waiting.** On the Open tables page, pick a game (or any game) and turn
  notifications on: your phone buzzes when a table opens for it, at most once every ten minutes.

Blocking someone from the whole card room, closing a table and removing a chat message are the
card room host's, in the admin app (see `CARDROOM_ADMIN_TOKEN`). Family tables that were never
opened to everyone have no table host, no chat filter and no mute.

### Report a problem

Players can report a bug without leaving the app or having a GitHub account. The 🐞 in the corner
of every screen (at a table on a phone: under ⚙︎) opens a short form: what went wrong (optional),
and two switches, one for a picture of the screen and one for the browser's details. The server
then opens an issue on GitHub for them and tells them its number.

To turn it on, make a [fine-grained token](https://github.com/settings/personal-access-tokens/new)
for this repository only, with **Issues: Read and write** and nothing else, and set it as
`CARDROOM_GITHUB_TOKEN`. Issues are opened in the name of the token's account, labelled `bug` and
`player report`. Without a token the button isn't shown (nor on the GitHub Pages copy, which has no
server).

- **In every report:** the player's words, the screen and game, when their copy of the page was
  built, the server's version, and the last few errors the page logged. From a table on the server:
  its game, rules, settings, and how many people and computer players are seated.
- **Only if the player agrees:** a picture of the screen (shown to them first), and their browser,
  device and window size (also shown first).
- **Never:** names, chat, the player's cookie, or a table's link. Issues are public, and the form
  says so. Which table a report came from is kept on the server (`bugs/reports` in the log).
- GitHub's API can't attach a picture to an issue, so screenshots are kept by the server (the
  newest 30) and the issue links to `/bugs/shots/<id>.jpg`.
- One browser can send 3 reports in ten minutes, and the whole card room 40 a day. A blocked player
  can't send any. A player's words can't mention people or link other issues.

**Ask for a game.** With the same token, the front page's footer shows “Don't see your game? Ask
for it”: a game's name and an optional note become an issue labelled `enhancement` and
`game request`. Asking for a game that already has an open request adds a comment to it instead, so
an issue's comments count how many want it. Requests share the reports' limits.

**Tidied before it's sent.** When the card room has its own AI key (`CARDROOM_AI_KEY`, see **Bot
talk from a model**), the form's button says **Next**: the player's words come back as a short title
and a concise report (for a request, the game's proper name and a short note). The player sees it
before anything is sent, and can change any of it, put their own words back, go back, or look at
**See exactly what's sent**. A tidied report keeps the player's own words too, folded away under
“The player's own words”, and says it was tidied. The model is told to keep every fact and add
none. If it fails, the player is told and their own words go. One browser can ask for 8 tidy-ups in
ten minutes, and the card room 200 a day (counted against the key's daily ceiling too).

## Packages

| Package | |
| --- | --- |
| [`packages/games`](packages/games) | The game kit and the fifty-four games built on it: `table.ts` (the `TableGame` engine contract every game shares), `kit.ts` (the card kit: `CardGame`, cards, decks, `KitView`), `board.ts` (the board kit: `BoardGame`, grids, pieces, dice, `BoardView`) and `sport.ts` (the table-sports kit: `SportGame`, shots, `SportView`) |
| [`packages/rules`](packages/rules) | Spades rules engine, bots, and the personas who play every game |
| [`packages/palace`](packages/palace) | Palace rules engine: house-rule presets, seat views, bots and table talk |
| [`packages/physics`](packages/physics) | A small deterministic 2D physics core for the table sports: the same shot gives the same table on the server and in every browser, which is how Mini Golf's server decides a putt and every browser animates it |
| [`packages/rooms`](packages/rooms) | Turn-based rooms over `@zubra/sync`: seats, server-decided moves, private views, bots |
| [`packages/server`](packages/server) | The server: every game's rooms, houses, challenges, tournaments, the lobby, the sync log and the web app |
| [`packages/web`](packages/web) | The app (React, with the game chooser in Vue): the card table, the board table and the canvas table for table sports, setup screens, houses, practice |
| [`packages/designer`](packages/designer) | The card designer (Svelte): draw a deck, keep it or share it, play with it |
| [`packages/watch`](packages/watch) | The watch page (Solid): the tables playing now, and tables of computer players to learn from |
| [`packages/admin`](packages/admin) | The admin app (Angular): the host moderates tables, players and shared designs |
| [`packages/decks`](packages/decks) | Card designs: what a deck looks like, checked, and turned into the CSS variables the cards read |
| [`packages/conformance`](packages/conformance) | One fixture of the components in every framework, and one set of browser tests run against them all |
| [`packages/ui`](packages/ui) | Components in Zubra: our own (cards, seats), the ones copied from zubra-ui, and the `<card-room>` embed |

One set of Zubra components serves five frameworks: React and Vue in the card room, Svelte in the
designer, Solid on the watch page and Angular in the admin app.

The server decides every move. Each player's browser only ever receives its own view of a table
(its own hand), never the whole game; moves the rules don't allow are refused on the server.

## How computer players think

A computer player's move is a pure function of the table: the game's state, the seat, the bot's
name (its persona, and so its style) and the table's settings. The server holds every table on one
thread, so a think that takes a while would hold up everyone. It doesn't have to:

- **Quick thinks stay on the main thread.** A card game's bot answers in a few hundredths of a
  millisecond; sending the state to another thread and the move back costs about a tenth of one.
- **Heavy thinks go to a worker thread.** A game says which those are with `TableGame.heavy(state,
  seat)` (a search in Checkers, Reversi, Go, Drop Four and the big Tic-Tac-Toe boards; hundreds of
  simulated putts in Mini Golf). The server keeps a small pool of `worker_threads`
  (`packages/server/src/botpool.ts`), each running the same engine code, and the room waits for the
  answer. In practice mode the browser does the same with a Web Worker.
- **The pause hides the think.** A bot's thinking starts the moment its humanlike pause does, and
  the move is played when both are done: a think shorter than the pause costs the table nothing.
- **An answer is only played on the state it was worked out for.** If the table moved on meanwhile
  (someone else moved, a turn timer fired) the answer is dropped and the bot is asked again; if the
  bot was stopped (the game ended, the settings changed, the table was closed) it's just dropped.
  The move itself goes through the room's `act` and into the move log like anyone's.
- **A think has a budget and a ceiling.** `bot(state, seat, style, rand, budget)` is told how long
  it may take (`budget.ms`, from `CARDROOM_BOT_BUDGET`, 2000 by default). Most bots ignore it:
  they ration themselves by work done, so they play the same move on any machine. Go uses it (its
  ration grows with the budget, and the clock is the hard stop: see [Go](#go)). Chess sizes its
  ration of work from the budget, and on a chess clock searches by the time and stops inside it. A think still running at the
  ceiling (`CARDROOM_BOT_CEILING`, three times the budget by default) is abandoned: its worker is
  terminated and replaced, and the seat plays a quick move instead (the same bot asked with
  `QUICK_STYLE` and `QUICK_BUDGET`: no skill, no time), so one runaway search can never hang a table.
- **Fair shares.** Thinks wait in one queue, first come first served, and a table never has two
  running at once. The move a turn timer makes for someone who ran out of time never queues: it's
  worked out on the main thread, there and then, with a short budget (`TIMEOUT_BUDGET`).

The pool has one worker for each processor the server may use but one, at least one and at most
four; `CARDROOM_BOT_WORKERS` sets the number, and `0` turns the pool off (every think on the main
thread, as before: also what happens by itself if worker threads can't start). A worker is another
copy of the engines, about 35 MB of memory each. Each worker warms
the table sports' physics as it starts, as the main thread does, while the server is already
listening. `GET /healthz/bots` shows how it's going (workers, thinks waiting and running, usual and
worst think time, how many were given up on), and so does the admin app's overview.

`node packages/server/scripts/bench-bots.mjs` measures what a trip to a worker costs for each kind
of game, and `node packages/web/scripts/practice-hitch.mjs <address>` how long the page freezes in
practice mode.

## Development

```sh
npm install
npm test
npm run dev        # the server on :8787 and the app on http://localhost:5173
```

Family tables, houses, challenges, tournaments, the designs gallery, watching and the admin app
need the server. Practice against the computer and designing decks work anywhere, including the GitHub
Pages build of the app.

The card designer (`npm run dev -w @cardroom/designer`, http://localhost:5174/designer/), the
admin app (`npm run dev -w @cardroom/admin`, http://localhost:5175/admin/) and the watch page
(`npm run dev -w @cardroom/watch`, http://localhost:5176/watch/) have dev servers of their own, which also talk to the server on :8787. For the admin app, start the server with a
token: `CARDROOM_ADMIN_TOKEN=anything npm run dev -w @spades/server`.

## Designing cards

The card designer lives at `/designer/` (there's a link on the card room's front page). A deck is
its back (a pattern, three colours and an emblem), its paper, an ink for each suit (two colours or
four), its lettering and its corners. Saving one keeps it under **My decks**; turning on **Share
it in the gallery** puts it where everyone in the card room can play with it or remix it.

**A table's deck.** In a table's lobby, before the deal, anyone seated picks the table's cards:
one of the card room's own decks, one of theirs, or any deck in the gallery. Everyone at the table
and everyone watching then sees those cards. The table keeps its own copy of the design, so its
maker changing or deleting it, or the host hiding it, never changes the cards in the middle of a
game. A table can only wear a deck its chooser could show everyone: theirs, or a shared one.

**A house's cards.** A house's owner or an admin picks, on the house's page, the deck its tables start with (`POST /houses/:slug/deck`), from the same choices. The house keeps its own copy, as a table does, every member sees which it is, and the players at a table can still pick another before the deal. Tournament matches start with it too.

**Your own deck.** **Play with it** in the designer makes a deck the one that browser sees at
practice tables and at tables that haven't chosen. **Always show me my own deck** keeps it even at
tables that have, for anyone who reads their own cards best.

A design is data, never CSS or markup from a page: colours and choices from fixed lists, checked
again on the server (`packages/decks`). The designer won't save a deck you couldn't play with
(inks too faint for the paper, two suits in the same ink).

## Watching a game

The watch page lives at `/watch/` (there's a link on the card room's front page).

- **Learn from the computer.** Pick a game, how well the computer players should play and how
  fast, and they sit down and play it out. You see every hand, and can look over any seat's
  shoulder. A few of these tables can be going at once (six); a new one waits for one to finish.
- **Playing now.** Every table with a game going. At a table with people you watch the play card
  by card from any side of the table, but never see a hand: a watcher gets only what every player
  at the table can already see. The host can keep people's tables off this list altogether (admin
  app, **Games**).

How a watcher's view is made: after each move the server builds every seat's view, keeps what they
all show alike and drops whatever differs (a hand, the moves on offer, a card only one player has
peeked at). That works for every game without the game saying which parts are private; each kind
of game names its private parts as well (`watchView` in `packages/server/src/games.ts`, on
`sharedView` from the rooms kit). `packages/server/test/watching.test.ts` plays every game and
checks no card reaches a watcher that any seat can't see.

## Moderating the card room

Whoever runs the server can look after it from the admin app at `/admin/`. It's off until the
server has an admin token (see **Settings**); sign in with that token.

| | |
| --- | --- |
| **Tables** | Every table and who's at it. Look at one to read its chat, remove a message, take someone out of a seat (a computer player takes over if the game has started), or close the table for good, with a reason everyone there sees. |
| **Players** | Everyone who's sat down, joined a house or saved a design. Blocking someone stops them sitting, playing, chatting, opening houses and sharing designs; tables they're at carry on without them. Unblocking undoes it. |
| **Houses** | Every house and its members. Rename a house (its invite link stays the same), remove a member, hand it to a new owner, or delete it. |
| **Games** | Which games the card room offers and in what order: the front page follows. Switching a game off stops new tables of it everywhere (tables already going carry on). Also the switch for whether tables with players can be watched (the table, never a hand). |
| **Card designs** | Every shared deck. Hiding one takes it out of the gallery; its maker keeps it and sees your reason. |
| **Activity** | Everything done from the admin app, newest first. |

Players are browsers, not accounts: a player is a cookie, and a name is whatever they typed when
they sat down. The admin app never sees the cookies, only a reference that's enough to block
someone with. A blocked person who clears their cookies is a new player, so blocking is for
keeping a family room friendly, not for keeping a determined stranger out; for that, don't share
the room's address.

## Adding a game

Most games belong on the kit, which gives them a table, the setup screen, house rules, computer
players at the table, houses, challenges and tournaments for free. Every kit game is a
`TableGame` (`packages/games/src/table.ts`): presets and rule fields, `newGame` (a deterministic
start from a seed), `apply` (never changes the state it's given, and throws a `GameError` for a
move the rules don't allow), `view` (what one seat may see and do), `bot`, `thinkingTime` and
`summary`. The only thing that differs between a card game, a board game and a table sport is
what `view` returns.

If the bot's think is more than a millisecond or two (it searches, or simulates), give the game a
`heavy(state, seat)` that says when, so the think is done off the main thread, and if it thinks by
the clock, keep inside the `budget` that `bot` is handed (see
[How computer players think](#how-computer-players-think)). Without `heavy` a bot thinks on the
main thread, which is right for anything quick.

### A card game

1. **The engine:** `packages/games/src/<game>.ts`, a `CardGame<Rules, State, Move>` (see
   `packages/games/src/kit.ts`), whose `view` returns a `KitView`: the hand and which cards a tap
   plays, the middle of the table, melds, buttons, scores. Go Fish, Golf and Whist are short
   worked examples; `poker.ts` is the shared core for the poker games.
2. **Register it:** add its id to `CardGameId` in `table.ts`, add it to `CARD_GAMES` in
   `registry.ts`, and export it from `index.ts`.
3. **Tests:** `packages/games/test/<game>.test.ts` for its rules. The shared kit tests
   (`test/kit.test.ts`) play every registered card game automatically: computer players finish
   whole games at the smallest, usual and largest table with every preset, the same seed always
   deals the same game, views match the state, and refused moves change nothing.
4. **Its tile on the front page:** a fan of three cards in `packages/web/src/home/Home.tsx`.

### A board game

1. **The engine:** `packages/games/src/<game>.ts`, a `BoardGame<Rules, State, Move>` (see
   `packages/games/src/board.ts`), whose `view` returns a `BoardView`: one or more grids of cells
   with at most one piece each (optional shading, coordinates, blocks of cells, highlights for the
   last move and a winning line), pieces off the board in reserves, buttons, scores. A grid says
   what you can do on it in one of two ways: `tap` lists cells that send `{ type, cell }` when
   tapped (or `{ type, col }` for a drop game), and `select` lists pieces you can pick up (a cell,
   or a kind of piece in your reserve) with where each can go, sending `{ type, from, to }`. List
   exactly the legal moves: the table offers nothing else, and `apply` still refuses the rest.
   `tictactoe.ts` is the worked example, with three computer players: a solved 3×3, a scored
   search for bigger boards, and a look-ahead for Ultimate. `dropfour.ts` is the drop game (column
   taps, a rack with `gravity`), and the example of a game with a clock of its own (`deadline`).
   `combat.ts` is the worked example for everything Tic-Tac-Toe doesn't need:
   - **Hidden information.** A seat's view must hold nothing that seat shouldn't know, in cells,
     labels, marks or narration. Combat builds the view and the computer player's move from one
     function (`seen`) that is the only code to read the other seat's ships, and its tests move
     the hidden ships about and check the view doesn't change by a character. `summary` is public:
     keep secrets out of it too.
   - **A second, private grid** (`owner` is the seat it belongs to). The first grid is the main
     one; the second is drawn smaller beside it (on a phone, beside the notes and buttons). With
     two grids every board move carries `grid`.
   - **Everyone moving at once** (placing ships): `turn` is null and each seat's view offers its
     own moves. The turn timer goes on whoever the computer player would still move for.
   - **Reserves you place from:** a `select` source whose `from` is the `kind` of a piece in your
     reserve. `select.suggest` names a source the table picks up for you while you hold nothing
     else, so placing is one tap a piece. A button (`choices`) pressed while something is picked
     up leaves it in your hand, which is how a ship is turned before it's put down.
   - **Pieces longer than a cell:** give every cell of one the same `span`. The table joins them
     into one shape, and a tap on any of its cells picks up the whole piece (list it once in
     `select`, by any one of its cells).

   `checkers.ts` is the worked example for pieces that move (`select`). The table lets a piece be
   tapped and then its destination, dragged there, or played from the keyboard, and slides any
   piece that has an `id` to where it went. Three things in the kit came with it and are there
   for the next game: `flip` on a grid draws the board from the far side for the seat that sits
   there (cells keep their numbers and names; only the drawing turns); `held` in `select` names a
   piece that is already in hand, for a move made in several taps (a run of jumps is one hop per
   move, the seat keeps the turn, and the capture in progress lives in the engine's state); and
   the `must` mark rings a piece that has to move. A piece with `faded` set is drawn faintly: a
   piece jumped but not yet taken off.

   `go.ts` is the worked example for a board of crossings: `points` on a grid puts the pieces
   where the lines cross (the table draws the lines and any `"spot"` cells as star points, and
   on a touch screen with small crossings asks for two taps to put a piece down), the `barred`
   mark is an empty cell that can't be played this turn, and `claimed` marks (with an `owner`)
   are cells counted as a side's own. A button with `confirm` asks its question before it is
   sent. It is also the example of a computer player that uses its `budget`, and of a phase in
   which both players act at once on the same board (agreeing the count: `turn` is null).
   `chess.ts` added three more. `select.choose` lists moves that need one more thing said (what a
   pawn becomes): the table asks on the square and sends the answer with the move. `record` in
   the view is the game so far in its own notation, with what each move changed, so the table can
   list the moves and step back through them (`cellsAfter`). And `clock` on a seat is a clock of
   the game's own (see [Clocks and deadlines](#clocks-and-deadlines)). A game whose pieces should
   be drawn rather than typed adds a set to `packages/web/src/board/pieces.tsx`, keyed by `kind`.
   `backgammon.ts` is the worked example for a board that isn't squares. Three more things in
   the kit came with it:
   - **A track** (`track` on a grid, a `BoardTrack`): the cells are places pieces travel along,
     `path` lists them in the order the first seat travels them (the second goes the other way),
     and `bar` and `home` name a cell per seat for pieces knocked off and pieces that have
     finished. `kind` says what the places are ("points"); nothing says how they are drawn.
     They are still cells, so `tap` and `select` work unchanged, and `rows` × `cols` still gives
     a plain picture of the board for a table that doesn't know the kind. The table numbers the
     points from the viewer's own end, lays the board on its side on a phone, and puts the dice
     and the cube on it.
   - **Stacks:** a piece with `count` is that many identical pieces on one cell, and `ids` names
     each of them from the bottom up, so the table can slide the one that moved (a checker that
     is hit keeps its id on the way to the bar).
   - **`flip: "rows"`** turns the board over instead of round: the last row is drawn at the top
     but left stays left, so both players run the same way and have their home on the same hand.
   - **`cube`** on the view (`BoardCube`): the doubling cube's `value`, its `owner` (null in the
     middle), who has `offered` a double that is waiting for an answer, and `dead` when it is
     out of play. Offering, taking and dropping are ordinary buttons (`choices`).
   - **`quick`** in `select`: a piece with one place to go is played by tapping it. It is a table
     rule in Backgammon; the engine only passes it on.
   - A turn of several steps that can be **taken back** keeps its steps in the state until the
     turn is over (`undo` is a move like any other, offered as a button). It is safe there
     because the dice are already on the table: never offer it where a step shows the player
     something new. The legal steps come from a generator of whole turns, so a rule about the
     whole turn ("play both dice if you can") holds at every step; and the computer player
     picks a whole turn and plays its first step each time it is asked.

   A view can also have **dice** and a **score sheet**, beside its grids or instead of them
   (`grids: []` is a fine view). `yacht.ts` is the worked example of both, with no board at all:
   - **`dice`** (`BoardDice`): the dice on the table, each `{ id, value }` with `value` null
     before it has been rolled, `held` for a die kept back from the next throw, `used` for one
     that has been played or is left over (drawn dimmed), and `owner` when the dice aren't all
     one player's. A die keeps its id from throw to throw. The engine throws them, from its
     seeded random source (`nextRandom`), like a deal: a view only says what each die shows, and
     the table only animates towards that. `roll` goes up by one with every throw, which is how
     the table knows to tumble the dice that aren't held (and to make the sound). `tap` lists
     the dice a seat can tap now, each sending `{ type, die }`. Dice that belong to one seat
     alone (everyone rolling at once) say so with the `owner` of the whole `dice`, exactly like
     a private grid: they are only in that seat's view, and a watcher is shown none.
   - **`sheet`** (`ScoreSheet`, in `table.ts`; Mini Golf's scorecard is the same type): a
     column per thing scored and a row per player, all strings. A column nobody fills in (a
     bonus) has `kind: "sum"`. `pick` lists the cells of the seat's own row it can choose now
     and what each `would` score; choosing one sends `{ type, cell }` with the column's `id`.
     `last` is the cell filled in last. The board table draws a sheet with the boxes down the
     page and a column a player, your own first; on a phone it shows your own sheet folded in two.
   - Nothing about how a die or the sheet looks belongs in a view: a die is an `id` and a
     `value`, and the table (`Dice.tsx`, `Sheet.tsx` in `packages/web/src/board/`) decides the rest.
   - A turn of several steps (roll, keep, roll, score) is a move a step, as a run of jumps is in
     Checkers. The computer player has to give the same answer each time it's asked between two
     steps: Yacht's decides whether it is having a careless moment from the dice, not from
     `Math.random()`.
2. **Offers, for a game with two sides:** resigning, draw offers and taking a move back are built
   once (`packages/games/src/offers.ts`) and a game opts in by wrapping itself. Its own `apply`,
   `view` and computer player don't change:

   ```ts
   const rules: BoardGame<ChessRules, ChessState, ChessMove> = { /* the game */ };

   export const chess = withOffers<ChessRules, ChessState, ChessMove>(rules, {
     // End the game on the board: `winner` takes it, or nobody (a draw). `s` is a copy to change.
     // `settleMatch` does it for a state shaped like the other board games' (wins, draws, round…).
     settle: settleMatch,
     // Moves can be taken back. Leave it out (the default) if any seat can't see everything, or a
     // move decides anything by chance; a function can rule out some tables: (s) => !s.rules.blitz.
     takeBack: true,
     // For a computer player answering a draw offer: above zero is better than level for `seat`.
     standing: (s, seat) => material(s, seat) - material(s, 1 - seat),
   });
   ```

   The wrapper adds the moves (`{ type: "resign" }`, `{ type: "offer", offer: "draw" | "takeback" }`,
   `{ type: "accept" }`, `{ type: "decline" }`), a house rule (`offers`: all, no take-backs,
   none), and `offers` in the view (what is open, who made it, what this seat may do), which the
   board table draws. What it needs to remember lives in the state under `offers`, so it is in
   the move log's replay like everything else; that includes the last four positions for taking
   back (`history`), which never reach a view. Nothing is kept across a move that changed the
   state's `rng`, after a game ends, or in a game that didn't say `takeBack`. A game whose state
   isn't shaped like the others writes its own `settle` (and `live`, if "a game is being played"
   isn't `phase === "playing"`: Combat's placing and shooting are both). Other options:
   `drawGap`, `backGap`, `levelAfter`.
3. **Register it:** add its id to `BoardGameId` in `table.ts`, add it to `BOARD_GAMES` in
   `registry.ts`, and export it from `index.ts`.
4. **Tests:** `packages/games/test/<game>.test.ts` for its rules. The shared board tests
   (`test/board.test.ts`) play every registered board game automatically: computer players finish
   whole games with every preset at every table size, a game can be played from nothing but what
   its views offer, every move a view offers is accepted (offers included: made, answered and
   taken back along the way), the same seed always starts the same game, and refused moves change
   nothing. `test/offers.test.ts` checks every game with offers can be resigned and drawn, in one
   game and in a match; add a take-back case there for a game with a move made in several taps.
   Dice and a sheet are checked too: dice have ids of their own and show faces they have, a die
   that can be tapped is on the table, a cell that can be chosen is an empty one in the seat's own
   row. So are stacks (a whole number of pieces, each named once), a track (its places are cells of
   the grid, each once) and the cube.
5. **Its tile on the front page:** a little board position in `BOARDS` in
   `packages/web/src/home/Home.tsx`, or for a dice game a few dice in `DICE`. (Backgammon's is a
   board with `shade: "points"`.)

### A table sport

A game played by striking a ball: mini golf, and next billiards, Carrom and bowling. These stay
turn-based. A move is a shot in the whole numbers of [`packages/physics`](packages/physics)
(`{ type: "shot", body, angle, power }`: hundredths of a degree, and 0 to 1000); `apply` plays it
to rest with `simulate` and keeps where everything stopped; every browser steps the same
simulation to animate it and lands on the same table, because the physics is deterministic to the
bit.

1. **The engine:** `packages/games/src/<game>.ts`, a `SportGame<Rules, State, Move>` (see
   `packages/games/src/sport.ts`), whose `view` returns a `SportView`: the physics world at rest
   (walls, pockets, regions, tunnels, any number of bodies of any size), a `look` that says what
   each part is (see **Renderers** below), `ghosts` (things drawn that this world's physics
   doesn't know: the other players' balls when mini golf is played all at once, or a ball lifted
   off the tee), `shoot` (the body this seat may strike and the range of power,
   or null), `last` (the shot just taken, the bodies it started from and where the physics came
   to rest, so the table can replay it), a score `card`, buttons and scores. `minigolf.ts` is the
   worked example, with a computer player that tries a few hundred putts in its head and then
   hits the best one about as well as its persona can.
2. **Register it:** add its id to `SportGameId` in `table.ts`, add it to `SPORT_GAMES` in
   `registry.ts`, and export it from `index.ts`.
3. **Tests:** `packages/games/test/<game>.test.ts` for its rules. The shared sport tests
   (`test/sport.test.ts`) play every registered table sport automatically: computer players finish
   whole games with every preset at every table size, the shot every view carries really does end
   where the view says it did, a seat is offered a shot exactly when the engine will take one,
   the same seed and dice give the same game, and refused shots change nothing.
4. **Its tile on the front page:** a little table seen from above in `TABLES` in
   `packages/web/src/home/Home.tsx`.

The table screen (`packages/web/src/sport/`) needs nothing: it fits any `SportView` to the screen
(turned on its side only if that shows the table a good deal bigger), aims (pull back and let go, or the arrow
keys, or the buttons), and plays each shot with its sounds. Keep the state safe to replay: the room rebuilds a table after a restart by running its
logged shots through `apply` again, which gives the same table under the same `PHYSICS_VERSION`
and the same table data (the header of `minigolf.ts` says what that does and doesn't promise).

**Renderers.** A view describes what is on the table and never how it looks: everything is in the
world's own units and named by kind. `SportLook` says a wall is a timber rail so wide and so high
standing to one side of its line, a closed wall is a rock or a flowerpot of some height, a
one-way wall is a step with a drop, a patch of ground is grass, sand, water or paving and how far
above the garden it stands, a slope rises so far, a tunnel is a pipe, a hose or a burrow, and the
scenery is a gnome here and a wheelbarrow there, facing this way. There are no colours, pixels or drawing decisions in an
engine, in course data or in `SportView` (the shared sport test checks), heights are kept even
though the physics is flat, every body, wall and tunnel keeps a stable id, and the physics'
events say what happened to which of them and on which step. All drawing is behind one function,
`drawScene(ctx, width, height, dpr, fit, scene)` in `packages/web/src/sport/draw.ts`: the table
screen builds a `Scene` (the view's table, where each ball is this instant, the aim, what has just
splashed) and calls it.

Today that draws a model looked down on from an angle, on a 2D canvas, with textures painted in
code (`paint/`): no 3D library, no WebGL and no picture files.

- **The projection** is one small file, `projection.ts`: world x, y and height to the screen, and
  back again on the ground. It is a camera tipped back about 40° from overhead with no
  perspective, looking up the screen: the plan is not rotated (left is left, up is away), depth
  is foreshortened, and height goes straight up the screen, so everything shows its top and the
  face towards you. Drawing and the pointer both go through it, which is why a pull of the thumb
  sends the ball exactly the opposite way along the ground (`test/projection.test.ts` in the web
  package sweeps that). A table that fits the screen better on its side is turned before it is
  looked at, so the camera never looks sideways.
- **Heights are the view's.** Rails, blocks and bumpers carry a height, a patch of ground a
  `level`, a ledge a `drop`, a slope a `rise`, scenery an optional `height` (left out: what such
  a thing usually is). The renderer only adds what a view leaves open: water and sand lie a
  little below what they are set in (`paint/terrain.ts`). Ground that a ball plays on should not
  lie below the garden round it, or its near edge hides the ball: raise the rest instead (the
  last hole is a raised bed with a step down to the lawn).
- **What is in front hides what is behind.** The still part of a hole is painted once for a hole
  and a screen size and kept: the ground at its heights, then everything that stands up, the
  furthest first (`paint/course.ts`, `paint/order.ts`). Each frame copies that painting and draws
  what moves from the back of the table to the front; whatever stands in front of a ball is drawn
  again over it, and a ball that ends up mostly hidden is shown through as a ring.
- **From straight above** is the same drawing with no tilt: a choice in the ⚙︎ sheet at a table
  sport, kept on the device.

A renderer in three dimensions would take the same `Scene` and replace that one function; nothing in the
engines, the views, the server or the table screen's playback would change (its pointer maths
would use the new renderer's own way from the screen to the ground).

**Adding a mini golf hole** is adding data: a `hole({ … })` in
`packages/games/src/minigolfcourse.ts` with a name, a par, a tip, the tee, the cup, the patches of
green, and any rails (left out: one round each patch), blocks (each a kind: rock, pot, castle…),
ledges, bumpers, tunnels, slopes, sand, water, scenery and decorations, appended to a course's
`holes` (or a new course added to `COURSES`). Use whole numbers, make water at least 1000 units
thick so a hard shot can't jump it, and run the tests: `test/minigolfcourse.test.ts` checks every
hole of every course without being told about it (the world validates, everything described is
there, the tee and cup are on the green and clear of walls, sand and water, a ball can never get
anywhere that isn't grass, sand or water, tunnels let a ball out somewhere safe, and a search
over shots holes out within par + 2).

**Balls that collide.** Played in turn, every ball that is out on a mini golf hole is in the
world for every shot, and every seat (and anyone watching) is sent the same table. A ball that is
knocked stays where it stops; knocked into the cup it is holed for its owner with no extra stroke
(a house rule, on by default); knocked into the water or off the course it goes back where it
lay at no cost. A ball still lying on the tee is lifted while the next player tees off. Played
all at once there is no one table (each player is on their own shot of the hole), so each shot
has only the striker's ball in it and the other balls are drawn faintly as ghosts. The header of
`minigolf.ts` has the reasoning.

Nothing else needs touching: `KIT_GAMES` is all three lists together, and the room on the server,
the setup screen, the rules editor, houses, challenges, leaderboards, tournaments and practice all
go by it. The web app's `GameTable` picks the card table, the board table or the sport table from
the game.

A game the kit can't express (Spades and Palace predate it) gets its own engine package, a room
definition in [`packages/server/src/games.ts`](packages/server/src/games.ts) and a table in the
web app; Palace is the worked example (`packages/palace`, `packages/server/src/palace.ts`,
`packages/web/src/palace/`).

## Clocks and deadlines

Nothing happens in a room unless a seat or a computer player moves, except by a **deadline**: a
room definition may say what the server does if nobody moves in time
([`packages/rooms`](packages/rooms#deadlines) has the whole contract).

```ts
deadline: (state, { settings, seats }) => ({
  after: 30_000,                 // ms after the last move (or `at`: a server time)
  seat: state.turn,              // whose clock: pages count down on this seat
  move: () => ({ type: "pass" }) // made as that seat when time runs out; null for nothing
}),
```

The timeout move goes through `act` and into the move log like any other, so a replay gives the
same game, and a move that arrives as the timer fires is never applied on top of it. `act` gets a
fourth argument, `{ at, elapsed }` (when the server decided the move, and how long since the one
before); a game with real clocks keeps them in its state from that alone, never from `Date.now()`,
which is what makes a chess clock replay: `after: state.bank[state.turn]`, and `act` takes
`elapsed` off the mover's bank and adds the increment
(`packages/rooms/test/deadlines.test.ts` has one in forty lines).

Every game in the card room already has one deadline, the [turn timer](#the-turn-timer)
(`packages/server/src/timer.ts`). A game on the kit gets it for nothing: it needs `view().turn` to
say whose move it is and `bot()` to give a move for any seat that owes one.

A room counts `after` from the last move of any kind, and an offer and its answer are moves. So
that asking for a draw never buys time, a kit game's `apply` is handed the move's `{ elapsed }`,
the offers wrapper adds up what has gone by since the last move on the board, and that is taken
off both clocks: the game's own (`deadline`) and the turn timer (`TableGame.spent`). When the turn
timer runs out it plays `TableGame.play`, the computer player's move on the board, which is never
an answer to an offer.

### A game's own clock

A game on the kit can also have a clock that is part of its rules: a shot clock, a chess clock, a
window for claiming a discard. It says so from its state, with the optional `deadline` of
`TableGame` (`packages/games/src/table.ts`):

```ts
deadline(state) {
  // Drop Four in drinking mode: three seconds, once the other player's disc has landed.
  return state.clock ? { after: 3000, seat: state.turn, move: { type: "timeout" } } : null;
},
```

`after` counts from the last move anyone made, `seat` is whose clock it is, and `move` is made as
that seat when time runs out. It's a move like any other: `apply` decides what it does (in Drop
Four, a drink and a lost turn) and refuses it when no clock is running, and it goes into the move
log. `deadline` must be worked out from the state alone, never from the time of day.

- **Wired once.** `kitRoom.deadline` (`packages/server/src/kit.ts`) turns it into the room's
  deadline for every game, and `tableRoom.deadline` (`games.ts`) weighs it against the turn timer
  with `sooner` (`timer.ts`): whichever runs out first is the room's one deadline, and the game's
  own wins a tie. With no clock of its own running, the turn timer is all there is.
- **A little grace.** The clock is meant to run from when you can see the other player's move, and
  both that and your answer take a moment to travel. So the server waits `GAME_CLOCK_GRACE_MS`
  (400 ms, in `kit.ts`) past a game's own clock before it makes the timeout move, using the room
  deadline's `grace`. Pages count down to the time without it, and a move that arrives inside the
  grace is taken like any other. The turn timer has no grace: its shortest setting is 15 seconds.
- **Computer players** aren't held to a game's own clock (no deadline is armed on a bot's seat), and
  `botDelay` keeps them inside six tenths of it whatever the table's pace, so a person is never
  waiting longer for a bot than they'd be allowed themselves.
- **Replays and restarts.** A timeout is in the move log, so a replay gives the same game with the
  missed turn in it. After a restart a clock that was running is armed again from the last move's
  logged time, but never with less than the room's `deadlineGrace` (five seconds) from the restart:
  for a three-second clock that means a restart gives the seat five seconds, not a lost turn.
  Changing the table's settings mid-clock never puts off a clock that's already running.
- **Practice.** `LocalKit` runs the same `deadline` in the browser, on your own seat, with no grace
  (there's no trip to make), and shows the same countdown.
- **A clock that banks time** (Chess) keeps each side's time in its state: `apply` is handed how
  long the move took (`{ elapsed }`, with any time spent on offers added) and takes it off the
  mover's bank, and `deadline` is the bank of the side to move. Such a deadline says `strict`:
  it is armed on a computer player's seat as well, since the time is part of the game. A seat's
  view carries `clock` (what it had at the last move, and whether it is running) and the room
  publishes when that move was made (`moved`), so pages count the running clock down by the
  server's time.

## Putting a game on a site

The web build makes a `<card-room>` widget with Zubra's embed build. Paste this into any page (an
open.blog post, a WordPress HTML block, a Squarespace code block), with the card room's address:

```html
<script type="module" src="https://your-card-room/embed/cardroom.js"></script>
<card-room server="https://your-card-room" game="palace" challenge="abc123" who="Grammi"></card-room>
```

| Attribute | |
| --- | --- |
| `server` | The card room's address. Required. |
| `game` | `palace`, `spades`, or leave it out to offer both. (The widget plays these two; the other games open in the card room.) |
| `challenge` | Your challenge link's code (the end of `?challenge=…`), for a "Challenge Grammi" button. |
| `who` | The name on that button. |

**Play here** deals a practice game against the computer inside the page. **Challenge** and
family tables open the card room in a new tab: browsers don't let a game in a frame on someone
else's site keep you signed in, and the card room is where your houses and tables live.

The build also writes a WordPress plugin and a Shopify app block to `packages/web/dist/embed`
(see its README).

### On an open.blog site

open.blog sites place web components their theme offers from **Admin → Landing page → Add a
section**, with a form and no code ([ADR 0408](https://github.com/journey-to-code-org/open.blog/blob/main/docs/adr/0408-a-theme-offers-components-an-owner-places-with-a-form-and-a-section-holds-only-a-name-and-checked-values.md)).
The web build writes `<card-room>` in that shape to `packages/web/dist/embed/openblog/` (also served at
`/embed/openblog/`):

1. Copy `card-room.js`, `card-room.zb` and `card-room.css` into the theme's `components/` folder.
2. Add the `components` entry from `theme-components.json` to the theme's `theme.json`, and list
   `components/card-room.css` under its `stylesheets`. With seasons, put it on the theme they extend.
3. In Admin: **Landing page → Add a section → Card room**, then the card room's address and, for a
   Challenge button, your challenge link code.

With the `zubra` command installed where the site builds, open.blog renders the widget ahead, so
readers without JavaScript still see it and its link to the card room.

## Hosting the card room

One container runs everything; mount a volume so tables survive restarts:

```sh
docker build -t cardroom .
docker run -p 8787:8787 -v spades:/data cardroom
```

`GET /healthz` answers `ok` for health checks.

### Settings

| Variable | |
| --- | --- |
| `CARDROOM_DB` | The database file (the image uses `/data/spades.db`). Without one, tables live in memory. |
| `CARDROOM_BACKUPS` | Where copies of the database go (see **Backups**). Default: `backups` beside the database. `off` for none. |
| `CARDROOM_BACKUP_HOURS` | Hours between copies. Default 24. |
| `CARDROOM_BACKUP_KEEP` | How many copies to keep. Default 7. |
| `CARDROOM_VAPID_PUBLIC_KEY` | Push notifications: the public key (see below) |
| `CARDROOM_VAPID_PRIVATE_KEY` | Push notifications: the private key; keep it secret |
| `CARDROOM_VAPID_SUBJECT` | Optional: a `mailto:` or `https:` address push services can reach you at |
| `CARDROOM_SECRET` | Any long random text: encrypts the AI keys houses connect (see **Bot talk from a model**). Keep it the same for good. |
| `CARDROOM_AI_KEY` | Optional: an Anthropic or OpenAI API key for the whole card room, so every table's bots talk through a model (see **Bot talk from a model**) |
| `CARDROOM_AI_PROVIDER` | `anthropic` or `openai`, if the key doesn't say (a key starting `sk-ant-` is Anthropic's) |
| `CARDROOM_AI_MODEL` | The model for that key. Default: `claude-haiku-5-5` or `gpt-5.6-luna`. |
| `CARDROOM_AI_DAILY` | The most lines a day on that key, everyone together. Default 3000. |
| `CARDROOM_GITHUB_TOKEN` | Optional: turns on **Report a problem**. A GitHub token that may open issues on the repository below; keep it secret. |
| `CARDROOM_GITHUB_REPO` | Where reports are filed, as `owner/name`. Default `mnichols08/card-room`. |
| `CARDROOM_BLOCKED_NAMES` | Optional: more words that names and chat at open tables may not contain, comma-separated |
| `CARDROOM_ADMIN_TOKEN` | Turns on the admin app at `/admin/`: the token its host signs in with. Make it long and keep it secret (`openssl rand -hex 24`) |
| `CARDROOM_BOT_DELAY` | Fixed thinking time for computer players, in milliseconds (handy for testing) |
| `CARDROOM_BOT_WORKERS` | Worker threads for the computer players' heavy thinking (see **How computer players think**). Default: one per processor but one, from 1 to 4. `0` for none: everything on the main thread. |
| `CARDROOM_BOT_BUDGET` | How long, in milliseconds, a game that thinks by the clock is told it may take over a move. Default 2000. |
| `CARDROOM_BOT_CEILING` | How long, in milliseconds, before a think still running is abandoned for a quick move. Default: three times the budget. |
| `CARDROOM_WEB` | Where the built web app is, if not `packages/web/dist` |
| `CARDROOM_DESIGNER` | Where the built card designer is, if not `packages/designer/dist` |
| `CARDROOM_WATCH` | Where the built watch page is, if not `packages/watch/dist` |
| `CARDROOM_ADMIN` | Where the built admin app is, if not `packages/admin/dist/browser` |
| `PORT` | The port to listen on (8787; Railway sets its own) |

The older `SPADES_*` names for these still work; `CARDROOM_*` wins if both are set. Keep the
database file's name (`spades.db`) as it is: renaming it leaves saved tables and houses behind.

### Backups

With a database (`CARDROOM_DB`), the server copies it once a day into `backups/` beside it
(`/data/backups` in the image) and keeps the newest seven. A copy is a whole SQLite database
(`cardroom-2026-11-14T09-30-00.db`), taken while the card room stays open.

Those copies are on the same disk as the database: they're for a bad deploy or a mistake, not for
losing the disk. To keep one somewhere else, press **Download a copy now** on the admin app's
front page, or:

```sh
curl -fOJ -H "Authorization: Bearer $CARDROOM_ADMIN_TOKEN" https://your-card-room/moderation/backup
```

To go back to a copy: stop the server, put the copy where `CARDROOM_DB` points (delete any
`-wal` and `-shm` files beside the old one), and start it again. Everything since that copy is
gone, tables in the middle of a game included.

### On Railway

`.railway/railway.ts` describes the card room as its own Railway project: the service built
from this repository's Dockerfile, a 1 GB volume at `/data`, the health check, and one replica
(the server holds live connections and game state in one process, so never run two). Keep it in
a project of its own, because applying the file makes the whole project match it.

```sh
npm install -g @railway/cli   # once
railway login
railway init                  # a new, empty project (or `railway link` to an empty one)
railway config plan           # shows what it will create
railway config apply
```

Then, in the dashboard, generate a domain for the service under **Networking**. Generated
domains aren't part of the file. With the service connected to this repository (**Settings →
Source**, auto-deploy on), every merge to `main` deploys; otherwise deploy from the dashboard.

### Bot talk from a model

A house's owner or an admin can connect the house's own AI account on the house page, under
**Bot talk**: pick Claude (Anthropic) or OpenAI, paste an API key from that account, and write a
few notes about the family (who's who, nicknames, in-jokes). From then on the computer players at
that house's tables say hello, react and answer in the model's words. A question to the table, or
a bot's name, gets an answer too.

- The model only talks. The rules engines play every card and decide when a bot speaks.
- It's told only what the whole table sees: names, the public scoreboard, the recent chat and the
  family notes. Never a hand.
- The house's account pays for the lines (a few words each, at most 600 a day per house). If the
  model is slow, out of credit or switched off, the bots say their own lines.
- Leave the model empty and the card room picks a small one the account has, or tap **Choose from
  this account's models** to pick from the account's own list.
- A table outside the house (a quick table, a challenge) talks through the house's account too
  when one of its members is sitting at it. The family notes are only used when everyone at that
  table is in the house.
- The key is tried before it's saved, kept on the server (encrypted when `CARDROOM_SECRET` is
  set) and never sent to a page again: admins see its last four characters. A changed or lost
  `CARDROOM_SECRET` means pasting the keys again.

**One key for everyone.** Whoever runs the card room can set `CARDROOM_AI_KEY` instead (see
**Settings**). Then the bots at every table talk through it, in a house or not, and a house's
owner or admins only add their family notes, switch it off, or connect the house's own account
in its place. That account pays for everyone, so it has ceilings: 3000 lines a day in all
(`CARDROOM_AI_DAILY`), 600 for one house and 60 for a table outside a house. The same key also
tidies bug reports and game requests before players send them (see **Report a problem**). The key lives only in
the server's settings: it's never stored in the database or sent to a page.

Card Room connects with an API key from the provider's developer console; signing in with a Claude
or ChatGPT subscription isn't supported.

### Notifications

The app installs to a phone's Home Screen and can buzz it when someone challenges you or opens
a table in your house. The server needs a VAPID key pair for that; without one, notifications
stay off and the buttons for them don't show.

```sh
npx web-push generate-vapid-keys
```

Put the keys in the service's variables (on Railway: the service → **Variables**) as
`CARDROOM_VAPID_PUBLIC_KEY` and `CARDROOM_VAPID_PRIVATE_KEY` (see **Settings** above). Keep the
same keys for good: new keys quietly cut off every phone that already said yes.

On an iPhone, notifications only work from the Home Screen app (iOS 16.4 or later): open the
site in Safari, tap Share, **Add to Home Screen**, open Card Room from there and turn them on.
The app explains this when it's opened in Safari. Android phones can turn them on straight from
the browser.

#### Setting it up in the dashboard instead

1. **New project → Deploy from GitHub repo → `mnichols08/card-room`.** Railway sees the npm
   workspaces and offers a service per package. **Deploy only one.** The others are libraries
   and the front end, all built into the server. Delete any that get created.
2. **Settings → Source:** root directory `/` (the repository root, not `packages/server`), and
   builder **Dockerfile**. Leave build and start commands empty.
3. **Volume:** <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd> → "volume" (desktop browser; the mobile
   dashboard can't add one), attach it to the service, mount path `/data`.
4. **Variables:** none needed: the image keeps its database at `/data/spades.db`. Without the
   volume, tables live in the container and every deploy wipes them.
5. **Networking → Generate Domain.** The target port must be the one the server logs at start
   (`Card Room on http://localhost:8080`). Railway sets `PORT` (usually 8080), which overrides
   the Dockerfile's 8787. Or set `PORT=8787` yourself and use 8787.

#### When it doesn't work

| What you see | Why | Fix |
| --- | --- | --- |
| "Application failed to respond", but the deploy log says `Card Room on http://localhost:8080` | The domain points at another port | Set the domain's target port to the logged one |
| `/healthz` says `ok`, the page says "Build the web app first" | Built from `packages/server`, so the web app wasn't built | Root directory `/`, builder Dockerfile |
| Tables disappear after a deploy | No volume at `/data` | A volume mounted at `/data` |
| Players at one table see different games | More than one replica | One replica |
| A merge to `main` didn't change the site | The service isn't set to deploy on push | **Settings → Source**, auto-deploy on, or deploy from the dashboard |
| A Node version error in the build | The builder picked an old Node | `.nvmrc` pins 24; or set `RAILPACK_NODE_VERSION=24` |

Keep the card room in a project of its own, so `railway config apply` can never touch another app.

See [docs/SPEC.md](docs/SPEC.md) for the original plan.
See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next: board games, dice, tiles and table sports.
