# open.parlor

Formerly Card Room. Family card and board games online: fifty-six games with house rules saved as presets, family
**houses** with their own tables, leaderboards and tournaments (a knockout or a league), computer players with personalities,
challenge links, and a widget that puts a game on any site, including [open.blog](https://github.com/journey-to-code-org/open.blog) ones.

Built first for Grammi and Grammi's House. Everything runs in one small server you can host
yourself (Docker or Railway), and practice games work anywhere, including the GitHub Pages build.

[![Zubra conformance](https://img.shields.io/endpoint?url=https://journey-to-code-org.github.io/open.parlor/conformance/badge.json)](https://journey-to-code-org.github.io/open.parlor/conformance/)

The parlor is also the proving ground for [Zubra](https://github.com/journey-to-code-org/zubra): its
components are written once and used from React, Vue, Svelte, Solid and Angular, each in a different
part of the app. [How the parlor is built](https://journey-to-code-org.github.io/open.parlor/conformance/)
shows the checks that they behave the same in every one (and in Preact and Lit, in Chrome, Firefox
and WebKit), how the last run went, and what the checks have found.

This repository is the app. The games and the rooms they are played in come from two packages' repositories:
[open.games](https://github.com/journey-to-code-org/open.games) (the engine and every game) and
[open.rooms](https://github.com/journey-to-code-org/open.rooms) (turn-based rooms over Zubra's sync layer).

## The games

Spades and Palace have tables of their own; the other fifty-four are built on a shared game kit
([`packages/games`](https://github.com/journey-to-code-org/open.games/tree/main/packages/games)), so they all get the same setup screen, house rules editor, computer players,
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
| Pig | 2 to 6 | A dice game: roll as often as you dare and add it up, but a one loses the turn. To 50, 100 or 200, with one die or two (where two ones lose everything) |
| Ten Thousand | 2 to 6 | A dice game: six dice; set aside the ones that score and roll the rest for more, or bank before a bust takes it. To 2,500, 5,000 or 10,000, with or without a 500 turn to get on the board |
| Ship, Captain, Crew | 2 to 6 | A dice game: three rolls to find a six, a five and a four in that order; the other two dice are your cargo, and the biggest takes the round |
| Shut the Box | 1 to 6 | A dice game: roll and shut the tiles that add up to it, until a roll can't be made; what's left open is your score. Nine tiles or twelve, one round or several, or alone for a score |
| Liar's Dice | 2 to 6 | A dice game: everyone's dice are hidden. Bid how many of a number are under all the cups, or call the last bidder a liar; lose a call, lose a die. Ones wild or not, three to five dice each |
| Backgammon | 2 | A board game: race your checkers home and hit theirs on the way. A friendly game, a money game with the doubling cube, a match to 3, 5 or 7 points, or Nackgammon |
| Mancala | 2 | A board game (Kalah): sow a pit of seeds round the board, one a pit. End in your store to go again; end in your own empty pit to capture what is across. Three to six seeds a pit, one game or a match |
| Dominoes | 2 to 4 | The double-six set: lay tiles end to end, matching numbers, and play out your hand. Draw, Block or All Fives (ends that add up to a multiple of five score), to 50, 100, 150 or 200 |
| Mini Golf | 1 to 6 | A table sport: nine holes round a garden (a drainpipe, a pond, toadstools that kick, a mole's tunnels), in turn with balls that knock into each other, or everyone at once |

Poker and Blackjack are for chips only: everyone starts with the same stack, and the chips are
just for keeping score.

The 🍺 games are drinking games for adults (water counts). Party games (Thirty-One, President,
Bluff, Liar's Poker, Durak, Slapjack, Sevens, Cuckoo) also have a drinking-mode house rule, off
unless a table turns it on. Kids' games have none. Drop Four's drinking mode is a shot clock: once
the other player's disc lands you have three seconds to drop yours, or you take a drink and lose
your turn. Yacht's drinking mode is a table called Shotzee: roll five of a kind and everyone else
takes a shot; put a zero on your scorecard and you drink.

## The front page and a game's page

A first visit (no name, and no game opened on this device yet) gets a line saying what the parlor
is and that it is free, needs no sign-up and works offline, and a **Start here** row of six games
from different shelves. Below the filters, a row of chips (Card games 48, Board games 8, …) stays at
the top of the screen and jumps to each shelf.

A game's page puts **Play** first, under who's playing: practice against the computer (or play
together on this device, or Deal for a solitaire), then the ways to play with people (a family
table, Find players, this wifi). A game that needs people (Draw & Guess) starts with the family
table. The computer players, their speed and the animations are folded into **Settings**, open on a
wide screen; suit colours are only offered for card games.

## With no connection, and at one device

Once the parlor has been opened on a device, the games that need no server start with no
connection at all: practice against the computer, the solitaires, the arcade. The service worker
keeps a copy of the app (about 4 MB) and says "Ready to play offline" when it has it. Family
tables, houses, the lobby and challenges are rooms on the server, so their buttons wait for the
connection to come back.

A game with nothing hidden can also be **shared on one device**: on its setup screen, *On this
device* seats two or more of you (computer players take any seats left), and the screen turns to
whoever's move it is. That is Chess, Checkers, Go, Reversi, Tic-Tac-Toe, Drop Four, Backgammon, Mancala,
Yacht, Pig, Ten Thousand, Ship, Captain, Crew, Shut the Box, Memory, Hangman, Mini Golf, Bowling, Billiards, Carrom, Shuffleboard, Crokinole and Flick Football. A game with a hand to hide (every
turn-based card game, Dominoes, Combat, Liar's Dice, Criss-Crosswords, Secret Word, Anagrams) is **passed round** instead:
between people the screen is covered ("Pass to Grammi") until the next person taps. Games played at
once (Speed, Slapjack, War, Word Hunt, the Mahjongs) can't be shared on one device.

And when the internet is out but the wifi is up, one device can **host a table on the wifi**:
*Play on this wifi* shows a QR code, the others scan it (or tap *Join a game on this wifi*) and
show one back, and the host's browser runs the game with no server at all. Both only appear while
there is no internet: a game's page then has *Play on this wifi*, and a note at the foot of the
screen says what still works and offers *Join a game on this wifi*. With the internet up, a family
table does the same job, so the wifi buttons stay out of the way. It is a first
version: every kit game, and a guest who drops off can be let back in to the same seat. A parlor run on a laptop at home also prints its wifi
address, and a QR code for it, when it starts.

[docs/LOCAL-PLAY.md](docs/LOCAL-PLAY.md) has how all of it works, and what hasn't been tried on
real phones yet.

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
that keeps each group's liberties as stones come and go ([`packages/games/src/goboard.ts`](https://github.com/journey-to-code-org/open.games/blob/main/packages/games/src/goboard.ts)). On 9×9
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
- The server keeps the time, and it survives a restart (see [Clocks and deadlines](https://github.com/journey-to-code-org/open.games/blob/main/docs/clocks-and-deadlines.md)).
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
  `chessFen` in [`packages/games/src/chess.ts`](https://github.com/journey-to-code-org/open.games/blob/main/packages/games/src/chess.ts)).
- **Chess960.** A preset: one of the 960 starting rows, drawn by lot, the same for both sides and
  kept for a pair of games in a match so each player has it with each colour. Castling ends where
  it does in classic chess; you castle by putting your king on your rook.
- **The pieces** are our own, drawn as SVG in `packages/web/src/board/pieces.tsx` and keyed by
  the `kind` the engine gives ("knight"), so they are the same on every phone. "Show where a piece
  can go" is a house rule, on unless a table turns it off.
- **The computer player** is our own engine ([`packages/games/src/chesscore.ts`](https://github.com/journey-to-code-org/open.games/blob/main/packages/games/src/chesscore.ts)): iterative
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

Blocking someone from the whole parlor, closing a table and removing a chat message are the
parlor host's, in the admin app (see `CARDROOM_ADMIN_TOKEN`). Family tables that were never
opened to everyone have no table host, no chat filter and no mute.

### Report a problem

Players can report a bug without leaving the app or having a GitHub account. The 🐞 in the corner
of every screen (at a table on a phone: under ⚙︎) opens a short form: what went wrong (optional),
and two switches, one for a picture of the screen and one for the browser's details. The server
then opens an issue on GitHub for them and tells them its number.

This is [open.relay](https://github.com/journey-to-code-org/open.relay) set up for the parlor:
`@journey-to-code/relay` files the issues and enforces the limits, and `@journey-to-code/relay-ui`
draws the sheets, dressed in the parlor's own styles and zubra-ui's switch and text field. What's
left here is the glue: [`bugs.ts`](packages/server/src/bugs.ts) on the server (where it keeps its
records, who is asking, how a table is described) and [`bugReport.ts`](packages/web/src/bugReport.ts),
[`ReportProblem.tsx`](packages/web/src/ReportProblem.tsx) and [`GameRequest.tsx`](packages/web/src/GameRequest.tsx)
on the page.

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
- One browser can send 3 reports in ten minutes, and the whole parlor 40 a day. A blocked player
  can't send any. A player's words can't mention people or link other issues.

**Ask for a game.** With the same token, the front page's footer shows “Don't see your game? Ask
for it”: a game's name and an optional note become an issue labelled `enhancement` and
`game request`. Asking for a game that already has an open request adds a comment to it instead, so
an issue's comments count how many want it. Requests share the reports' limits.

**Tidied before it's sent.** When the parlor has its own AI key (`CARDROOM_AI_KEY`, see **Bot
talk from a model**), the form's button says **Next**: the player's words come back as a short title
and a concise report (for a request, the game's proper name and a short note). The player sees it
before anything is sent, and can change any of it, put their own words back, go back, or look at
**See exactly what's sent**. A tidied report keeps the player's own words too, folded away under
“The player's own words”, and says it was tidied. The model is told to keep every fact and add
none. If it fails, the player is told and their own words go. One browser can ask for 8 tidy-ups in
ten minutes, and the parlor 200 a day (counted against the key's daily ceiling too).

## The same you on another device

A player is a browser, not an account, so a new phone starts as a stranger to your houses, your
standing on a leaderboard and the decks and courses you made. **Use the parlor on another device**,
at the foot of the front page, hands you over: the device that is you shows a code (and a QR code
of a link); typed on the new one, that device becomes the same player, and is told your name and
your houses. Both are you from then on.

The code is eight letters and digits, good once, for ten minutes (`POST /me/move`, then
`POST /me/move/<code>`; [`packages/server/src/devices.ts`](packages/server/src/devices.ts)). An
address that gets eight codes wrong waits ten minutes. Anyone who has the code becomes you, which
is the whole of the security: it is for moving between your own devices, not for sharing.

What lives only in a browser doesn't come along: table settings, practice games, and scores that
were never sent to a house.

## Packages

The game engine and the rooms live in their own repositories and come in from npm: [open.games](https://github.com/journey-to-code-org/open.games) (the `@journey-to-code/games`, `rules`, `palace`, `physics` and `decks` packages) and [open.rooms](https://github.com/journey-to-code-org/open.rooms) (`@journey-to-code/rooms`); reporting a problem and asking for a game come from [open.relay](https://github.com/journey-to-code-org/open.relay) (`@journey-to-code/relay` and `relay-ui`). This repository is the app built from them. Paths such as [`packages/games/src/...`](https://github.com/journey-to-code-org/open.games/tree/main/packages/games/src/...) in the sections below are in open.games.

| Package | |
| --- | --- |
| [`@journey-to-code/games`](https://github.com/journey-to-code-org/open.games/tree/main/packages/games) | The game kit and the fifty-four games built on it: the `TableGame` engine contract, the card, board and table-sport kits, and the games |
| [`@journey-to-code/rules`](https://github.com/journey-to-code-org/open.games/tree/main/packages/rules), [`palace`](https://github.com/journey-to-code-org/open.games/tree/main/packages/palace), [`physics`](https://github.com/journey-to-code-org/open.games/tree/main/packages/physics), [`decks`](https://github.com/journey-to-code-org/open.games/tree/main/packages/decks) | Spades and the computer players' personas, Palace, the deterministic physics for the table sports, and card designs |
| [`@journey-to-code/rooms`](https://github.com/journey-to-code-org/open.rooms) | Turn-based rooms over `@zubra/sync`: seats, server-decided moves, private views, bots |
| [`packages/server`](packages/server) | The server: every game's rooms, houses, challenges, tournaments, the lobby, the sync log and the web app. It also draws two pages itself, `/games` and `/daily` (below) |
| [`packages/web`](packages/web) | The app (React, with the game chooser in Vue): the card table, the board table, the word table and the canvas table for table sports, setup screens, houses, practice |
| [`packages/designer`](packages/designer) | The card designer (Svelte): draw a deck, keep it or share it, play with it |
| [`packages/courses`](packages/courses) | Mini Golf courses and bowling lanes people make: painted on a grid, checked, and turned into a hole or a lane the game plays |
| [`packages/watch`](packages/watch) | The watch page (Solid): the tables playing now, and tables of computer players to learn from |
| [`packages/wasm`](packages/wasm) | Games compiled to WebAssembly, at `/wasm/`. The first is Delbie's Doomsday, a shooter on the open-source Doom engine with twelve levels of its own laid over Freedoom, alone or up to four together with others watching; the server only passes the players' commands along. Where there is no server, one device hosts for the others on the same wifi. With an editor (Svelte) that swaps the game's pictures and sounds for your own and changes its levels: what is placed in them, and their walls and rooms, rebuilt by a node builder that is also compiled to WebAssembly. Its engine is GPL-2.0: see the package's README |
| [`packages/admin`](packages/admin) | The admin app (Angular): the host moderates tables, players, shared designs and shared golf courses. A page per part at its own address (`/admin/tables/<id>`, `/admin/tables?show=open`), loaded when opened; reactive forms over the Zubra fields and switches |
| [`packages/conformance`](packages/conformance) | One fixture of the components in every framework, and one set of browser tests run against them all |
| [`packages/ui`](packages/ui) | Components in Zubra: our own (cards, seats), the ones copied from zubra-ui, and the `<card-room>` embed |

**A page the server draws.** The app needs JavaScript to show anything. `/games` doesn't: the
server renders it with [`@zubra/server`](https://github.com/journey-to-code-org/zubra/blob/main/docs/server-rendering.md)
([`pages.ts`](packages/server/src/pages.ts), [`games-page.zb`](packages/server/pages/games-page.zb)),
so every game the host has switched on is in the HTML, in the host's order, each linking to its
setup. Its form is a plain GET form: with JavaScript off, "Show" asks the server for the filtered
page; with it on, the components take over the HTML that is already there, the list follows the
fields as they change, and the button goes. It is made of the same zubra-ui components as the app,
served to the browser from `/_zubra/`. The front page links to it where there is a server to draw
it; a parlor published as plain files (GitHub Pages) has none.

Where the parlor takes requests, the page ends with "Ask for a game"
([`game-request.zb`](packages/server/pages/game-request.zb)), a form that posts to a function the
component marks `'use server'` ([`@zubra/actions`](https://github.com/journey-to-code-org/zubra/blob/main/docs/actions.md),
at `/_zb/action/…`). The function runs on the server and is never sent to the browser. With
JavaScript off the browser posts the form, the server sends it back to the page, and the page is
drawn with the answer once; with it on the post is a fetch and the page doesn't reload. A game the
parlor already has is pointed to; anything else goes to the same relay as the app's own sheet, with
its limits and its block list.

**The daily sudoku** (`/daily`, [`sudoku.ts`](packages/server/src/sudoku.ts),
[`daily-sudoku.zb`](packages/server/pages/daily-sudoku.zb)) is the same machinery with a grid of real
inputs. A puzzle is its date (seeded, changing at midnight in New York), always has exactly one
solution, and gets harder through the week by having fewer clues. The page is given the clues and
never the answer: "Check" posts the 81 inputs to a server function that compares them with the
answer and says solved, wrong (how many) or still open (how many), and nothing else. With JavaScript
off the post comes back to the same day with what was typed and the verdict, once; with it on the
grid follows the arrow keys, marks repeats in a row, column or box as they are typed, keeps the grid
for the day in the browser, and checks without reloading. Past days are at `/daily?d=YYYY-MM-DD`.
The clue count is the only dial for "hard", so a Saturday puzzle is fewer clues, not necessarily
harder techniques.

One set of Zubra components serves five frameworks: React and Vue in the parlor, Svelte in the
designer and in the Mini Golf course and bowling lane editors (Svelte inside the React app,
`packages/web/src/golf/`), Solid on the watch page and Angular in the admin app.

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

The games and rooms are installed from npm like any dependency. To try a change to them here, check
out open.games or open.rooms next to this repository, build it, and `npm link` the package (for
example `npm link ../open.games/packages/games`); when it's done, publish a new version and raise the
range in `packages/server` and `packages/web`.

The card designer (`npm run dev -w @open-parlor/designer`, http://localhost:5174/designer/), the
admin app (`npm run dev -w @open-parlor/admin`, http://localhost:5175/admin/) and the watch page
(`npm run dev -w @open-parlor/watch`, http://localhost:5176/watch/) have dev servers of their own, which also talk to the server on :8787. For the admin app, start the server with a
token: `CARDROOM_ADMIN_TOKEN=anything npm run dev -w @open-parlor/server`.

## Designing cards

The card designer lives at `/designer/` (there's a link on the parlor's front page). A deck is
its back (a pattern, three colours and an emblem), its paper, an ink for each suit (two colours or
four), its lettering and its corners. Saving one keeps it under **My decks**; turning on **Share
it in the gallery** puts it where everyone in the parlor can play with it or remix it.

**A table's deck.** In a table's lobby, before the deal, anyone seated picks the table's cards:
one of the parlor's own decks, one of theirs, or any deck in the gallery. Everyone at the table
and everyone watching then sees those cards. The table keeps its own copy of the design, so its
maker changing or deleting it, or the host hiding it, never changes the cards in the middle of a
game. A table can only wear a deck its chooser could show everyone: theirs, or a shared one.

**A house's cards.** A house's owner or an admin picks, on the house's page, the deck its tables start with (`POST /houses/:slug/deck`), from the same choices. The house keeps its own copy, as a table does, every member sees which it is, and the players at a table can still pick another before the deal. Tournament matches start with it too.

**Your own deck.** **Play with it** in the designer makes a deck the one that browser sees at
practice tables and at tables that haven't chosen. **Always show me my own deck** keeps it even at
tables that have, for anyone who reads their own cards best.

A design is data, never CSS or markup from a page: colours and choices from fixed lists, checked
again on the server ([`packages/decks`](https://github.com/journey-to-code-org/open.games/tree/main/packages/decks)). The designer won't save a deck you couldn't play with
(inks too faint for the paper, two suits in the same ink).

## Making a Mini Golf course

Mini Golf's setup screen has a **Course** list (the Back Garden, everyone's shared courses and your
own) and **Make your own course**, which opens the course editor (`/?golf=new`).

A hole is painted on a grid, up to 13 squares across and 17 down, one piece a square: green, a
brick wall, sand, water, a slope (it runs downhill the way its arrow points), a toadstool bumper,
high ground, a tunnel and its molehill, the tee and the cup. Tap or drag; a drag fills every square
it crosses.

- **High ground** is a raised terrace. A ball rolls off it anywhere, down a step, but only gets up
  it by a slope that runs downhill away from it: a ramp.
- **Tunnels** are a mole's hole and the molehill it comes up at, up to three a hole, numbered so
  each mouth goes with its molehill; the Tunnel and Molehill tools put down the next number
  missing. A ball that rolls into the hole pops up at the molehill, rolling out onto the green
  beside it (towards the cup, where there's a choice).
 Beside the grid the hole is
drawn exactly as the table will draw it. A course has up to nine holes, each with a name, a par (it
follows a suggestion worked out from the route to the cup until you set your own) and a tip shown
at the tee. **Play it against the computer** plays the course as it is, saved or not.

A hole saves only if it can be played: one tee, one cup, and a way between them a ball can roll
without crossing water, a wall or a bumper or climbing a step (a tunnel counts as a way through).
Every tunnel needs its molehill and the other way round. Garden shut in by the course becomes a
wall rather than a hole in the green.

**Playtested.** A route on the grid isn't enough (slopes pull, sand stops a ball, a bridge is
narrow), so as you paint, the computer plays each hole in the background: six tries putting like a
decent player, and one with perfect aim. Each hole gets a verdict (easy, fair, hard, very hard) with
the par it plays to, and **Watch the computer play it** replays a typical try on the preview. A hole
the decent player never gets in is one people won't either: it can't be saved until it's easier.
The server checks that a perfect putt can hole every hole of a course it's sent.

**Saved, or shared.** A saved course is yours alone; share it and it's in everyone's course list.
Courses are kept on the server like card designs. "Yours alone" means unlisted: a table isn't asked
who opened it, so someone given a private course's id could play it. Crude words in course and
hole names and tips are covered, as in chat.

**Changing a course.** Each save that changes the holes is a new version. A table plays the version
it started on to the end, even across a restart; new tables get the latest. Deleting a course, or
the host hiding it, stops new tables on it, and tables already playing it finish.

How it fits together: the game finds a course by its id in `COURSES` (in open.games), and builds a
hole from a description with `hole()`. [`packages/courses`](packages/courses) turns a painted grid into such a
description and puts the course in `COURSES` wherever the game runs: the server, its bot worker
threads (a think on a custom course carries the course with it), and the browser for practice games
(and the practice table's Web Worker, the same way).

## Word games

The six word games (Secret Word, Anagrams, Hangman, Word Hunt, Criss-Crosswords and Draw & Guess)
have a table of their own
([`packages/web/src/word/WordTable.tsx`](packages/web/src/word/WordTable.tsx)), drawn from the
games' `WordView`: rows of letter tiles, a rack, and a keyboard coloured by what is known of each
letter (green in its place, gold in the word, grey not in it). A phone uses the keyboard on the
screen; a computer's keyboard types too. A word is checked by the server, not the page: anything of
the right length is sent, and a word that isn't one comes back refused, in words.

- **Secret Word:** everyone guesses the same word on their own board. You see how the others'
  guesses went as coloured squares, never their letters, and neither does anyone watching.
- **Anagrams:** a word is handed in unseen, and all of them are turned over together. The rack
  can be shuffled on your own screen.
- **Hangman:** played in turn, with a gallows that fills in as the shared misses run out. It can be
  shared on one device.
- **Word Hunt:** a grid of letters against the clock. Drag (or tap) from letter to touching letter;
  a word someone else also found scores for nobody. What you found stays hidden until the end.
- **Criss-Crosswords:** tiles from a hand onto a 15×15 board with its own bonus squares. Tap a tile,
  then a square; Take back lifts them again. Your hand is yours alone, and watchers never see it.
- **Draw & Guess:** the artist picks one of three words and draws it; everyone else types guesses,
  and the sooner you get it the more it scores. It needs people (computer players can't draw), so
  it has no practice table: start a family table (or, with the internet out, play on this wifi).

The word list is in open.games (ENABLE, with SCOWL's frequency levels for which words are common),
and it is part of the app's download: about a quarter of a megabyte compressed in the main
bundle, and the same again in the computer players' worker and the course playtester's.

## Bowling

Bowling plays the way bowling games on a phone do:

- **Where you stand:** drag sideways on the lane to move along the foul line.
- **The throw:** swipe up the lane. The faster the swipe, the harder the ball; the way it slants is
  a little aim; and a swipe that **curls** at the end puts **spin** on the ball, which skids straight
  and then hooks late, the way it curled (open.games' physics has the hook; see its README).
  Before you throw, the lane shows the path the ball will take, hook and all.
- **Buttons too:** Stand, Aim and Hook with a power slider and **Roll**, for anyone who'd rather
  tap; on a keyboard, the arrows aim and set the power, Shift and the arrows move along the line,
  and `[` `]` set the hook.
- **In 3D** (bowling's default) the camera stands behind the bowler, down the lane, follows the
  ball to the pins, and watches them go: they topple the way they're knocked and lie in the pit.
  The lane stands in an alley: gutters sunk below the boards, the lanes either side with their own
  pins (and somebody bowling on them), kickbacks, numbered masking units, the ceiling and its lights.
- **The moment:** a strike, a spare, a split or a gutter ball gets a call-out, with **Replay** to
  watch it again in slow motion, and the next ball waits a moment so it isn't missed. The ball and
  the pins have their own sounds, and the score sheet (marks over running totals, the frame being
  bowled picked out) is always on screen.

## In 3D

Some games have a look in three dimensions as well as the flat drawing they began with. Each is
fetched only when its table is on screen and only where WebGL works; anywhere else, and for anyone
who prefers it, the flat drawing is still there (⚙︎ → **The table is drawn**; an arcade game has
its own **3D** switch, remembered for that game; `?flat` in the address turns it off for a visit).

- **Bowling and Mini Golf** (`sport/scene3d*.ts`, `sport/alley3d.ts`): the table sports' scene.
  "The best for each game" is 3D for bowling and the angled flat drawing for mini golf.
- **Tower of Ryan and Shitstorm** (`arcade/scene3d*.ts`): the scene is drawn on a canvas under the
  field's own, which then only draws what is written over it (words, the banner, the boss's bar).
  Tower of Ryan is a valley on a table, with the cave the creeps come out of and Ryan's gate.
  Shitstorm is what it says: a storm over a town, pigeons, gulls, flying outhouses and a honey
  wagon throwing what you'd expect, and the fan for a boss; you fly a plunger and a bomb is a
  flush. The engine still calls these things by their plain names: the parlor's words for them are
  in `arcade/flavour.ts`.
  Chip Stack is the one big chip on a card table, with the winnings stacked round it.
- **The boards** (`board/board3d*.ts`): Chess, Checkers, Reversi, Go (up to 13×13), Tic-Tac-Toe
  and Drop Four share one scene, each with its own board and set: a turned chess set on walnut,
  two-faced Reversi discs that turn over, stones on the crossings. Drop Four's rack stands on
  the table as the real one does, nearly upright: two blue grilles with a hole for every disc,
  and a disc dropped in at the top runs down its column between them. The board's grid of buttons is still what is tapped, dragged and read out: it is made
  see-through and tipped back by a CSS transform that is the scene's camera, so each button lies
  on its square. A game with no set of its own here gets plain counters.
- **Combat** (`board/sea3d-gl.ts`): the same trick, over a tray of rolling water. Ships are models
  that ride the swell, burn where they are hit and lie over black when sunk; a miss leaves a white
  float, and a shot that has just landed throws up spray or flame.
- **Every card table** (`.table.three`, `.spades.three` in `styles.css`): no canvas at all. The
  felt becomes a table seen from your chair, set out in space with CSS: the cards lie on it, the
  deck and the pile have their thickness, and what is read stands up to face you. Palace, Spades
  and all the games on the card kit; a table for one (the patiences) is tipped only a little.
- **Backgammon** (`.track.three`): the board tipped back the same way, with checkers that have an
  edge, and the dice it always had.

- **Delbie's Daycare & Geriatrics** (`idle/counter3d*.ts`): the counter, in the big button where
  the face was. It is a picture of what the numbers already say: the line is as long as the
  counter is chaotic and the phones ring with it, whoever has been taken on stands at the counter,
  a truck is out the back for each driver, the back room's boxes pile up, a red light turns when
  the books are full, and there is a sign on the counter when Delbie has the afternoon off. The
  store is a bar, one counter with everybody along it, and the crew stand behind it in the order
  the floor plan seats them, each at a screen that is lit while they are there, with Delbie in the
  middle. The floor plan is that same counter with the roof off (`idle/floor3d*.ts`), under the
  same see-through grid of buttons the boards use: the front row is the counter, a terminal and
  whoever has been taken on at it for each place and the door at the right-hand end; the back row
  is the wall behind, with the office, the bathroom, the microwave and the bench. What is picked
  up hangs over its square and only goes along its own row, and two neighbours that do something
  to each other are joined by a green or a red bar on the floor. The crew are themselves in both (`idle/people3d.ts`), from what the game says of each:
  Tommy's tie and clipboard, Pluto's cap and rabbit, B-Rice and his pasta, Ricky outside the
  bathroom on his phone when that is where he is. The inspector is in both as well: a grey suit, a hat
  and a clipboard, with the county's car across the back door from the minute's warning, pacing the
  end of the counter during the visit and walking the room's aisle with the count so far held up
  ("3 of 4"); a clean sheet leaves a PASSED sticker on the counter for as long as it is fresh. The payday board counts down and hands go up
  when the wages go out; a Store Move sends the boxes past and repaints the walls; and whatever
  has just gone in the incident log is said over the picture for a few seconds. The lists are as
  they were.

Still flat: a 19×19 Go board, whose crossings would be too close together to tap once tipped back.

## Making a bowling lane

Bowling's setup screen has a **Lane** list (the plain lane, everyone's shared lanes and your own)
and **Make your own lane**, which opens the lane editor (`/?lane=new`).

A lane is painted on a grid over the lane between the foul line and the pins, 10 squares across and
24 long, one piece a square: a crate, sand (slows the ball), water (a ball that rolls in is gone), a
slope (it pulls the ball the way its arrow points), or a toadstool bumper. The preview beside it is
the table's own drawing. **Bowl on it against the computer** plays a quick five frames on it, saved
or not.

A lane saves only if it can be bowled: the computer's own search, with the bumpers down, has to
find a ball from the foul line that knocks a pin down. As you paint, the computer bowls first balls
at it like a decent player, says how many pins they knock down on average, and **Watch a ball**
replays one. Lanes are kept, shared, versioned and
moderated exactly as courses are: the server keeps both in one place, each saying which it is. The
game finds a lane by its id in `LANES` (open.games 0.1.3 and later); [`packages/courses`](packages/courses)
puts it there wherever the game runs, as it does for courses.

## Watching a game

The watch page lives at `/watch/` (there's a link on the parlor's front page).

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
of game names its private parts as well (`watchView` in [`packages/server/src/games.ts`](packages/server/src/games.ts), on
`sharedView` from the rooms kit). `packages/server/test/watching.test.ts` plays every game and
checks no card reaches a watcher that any seat can't see.

## Moderating the parlor

Whoever runs the server can look after it from the admin app at `/admin/`. It's off until the
server has an admin token (see **Settings**); sign in with that token.

| | |
| --- | --- |
| **Tables** | Every table and who's at it. Look at one to read its chat, remove a message, take someone out of a seat (a computer player takes over if the game has started), or close the table for good, with a reason everyone there sees. |
| **Players** | Everyone who's sat down, joined a house or saved a design. Blocking someone stops them sitting, playing, chatting, opening houses and sharing designs; tables they're at carry on without them. Unblocking undoes it. |
| **Houses** | Every house and its members. Rename a house (its invite link stays the same), remove a member, hand it to a new owner, or delete it. |
| **Games** | Which games the parlor offers and in what order: the front page follows. Switching a game off stops new tables of it everywhere (tables already going carry on). Also the switch for whether tables with players can be watched (the table, never a hand). |
| **Tuning** | The numbers a game lets its host change without a release: Delbie's Back Room's hit points, healing, each card's cost and effects and each foe's hit points and attacks, and the daily sudoku's clues for each weekday. The form is built from the game's own ranges (a mistake shows where it was made and Save waits), a number left empty is the game's own, and *Back to the game's own numbers* undoes it all. Each save is a new version in the activity log. |
| **Card designs** | Every shared deck. Hiding one takes it out of the gallery; its maker keeps it and sees your reason. |
| **Courses & lanes** | Every shared Mini Golf course (with a plan of its first hole) and bowling lane (with its plan). Hiding one takes it out of the game's list and stops new tables on it (tables already playing it finish); its maker keeps it and sees your reason. |
| **Activity** | Everything done from the admin app, newest first. |

**Tuning a game's numbers** (the **Tuning** page above). A game can let its host change some of its numbers without a release
(Delbie's Back Room's cards and foes, the daily sudoku's clues for each weekday). What is kept is a
sparse override with a version, replaced as a whole and checked against that game's ranges
(`packages/server/src/tunables.ts`): a game reads `GET /tunables/<game>` when it starts and merges it
over its own numbers; `GET /moderation/tunables` lists what can be tuned, `POST
/moderation/tunables/<game> { values }` saves (a problem comes back as 422 and nothing changes) and
`POST /moderation/tunables/<game>/reset` goes back to the game's own numbers. Every change is in the
activity log. The version goes up on each, so a replay made on other numbers can say which it needs.

Players are browsers, not accounts: a player is a cookie, and a name is whatever they typed when
they sat down. The admin app never sees the cookies, only a reference that's enough to block
someone with. A blocked person who clears their cookies is a new player, so blocking is for
keeping a family room friendly, not for keeping a determined stranger out; for that, don't share
the room's address.

The same cookie can be on more than one device: see **The same you on another device**.

## Adding a game

How a game is built, as a card game, a board game or a table sport, lives with the engine in
[open.games](https://github.com/journey-to-code-org/open.games): see [Adding a game](https://github.com/journey-to-code-org/open.games/blob/main/docs/adding-a-game.md) and
[Clocks and deadlines](https://github.com/journey-to-code-org/open.games/blob/main/docs/clocks-and-deadlines.md). A game that joins this app is a
new version of `@journey-to-code/games`: it shows up in the game chooser, the room, houses,
challenges and tournaments with nothing else to wire, because they go by the list of games the
package exports.

A game the kit can't express (Spades and Palace predate it) gets its own engine, a room definition
in [`packages/server/src/games.ts`](packages/server/src/games.ts) and a table in the web app; Palace is
the worked example (the engine is [`@journey-to-code/palace`](https://github.com/journey-to-code-org/open.games/tree/main/packages/palace), the room is
`packages/server/src/palace.ts`, the table is `packages/web/src/palace/`).

## Putting a game on a site

The web build makes a `<card-room>` widget with Zubra's embed build. Paste this into any page (an
open.blog post, a WordPress HTML block, a Squarespace code block), with the parlor's address:

```html
<script type="module" src="https://your-card-room/embed/cardroom.js"></script>
<card-room server="https://your-card-room" game="palace" challenge="abc123" who="Grammi"></card-room>
```

| Attribute | |
| --- | --- |
| `server` | The parlor's address. Required. |
| `game` | Any game that can be played against the computer, or any arcade game, by its id (`hearts`, `chess`, `minigolf`, `secretword`, `airhockey`…), or leave it out to offer Spades and Palace. Draw & Guess is the one game it can't deal: computer players can't draw. |
| `challenge` | Your challenge link's code (the end of `?challenge=…`), for a "Challenge Grammi" button. |
| `who` | The name on that button. |

**Play here** deals a practice game against the computer inside the page. **Challenge** and
family tables open the parlor in a new tab: browsers don't let a game in a frame on someone
else's site keep you signed in, and the parlor is where your houses and tables live. An arcade
game is played against the game itself, so it gets **Play here** and a link to the game in the parlor.

The build also writes a WordPress plugin and a Shopify app block to `packages/web/dist/embed`
(see its README).

### On an open.blog site

open.blog sites place web components their theme offers from **Admin → Landing page → Add a
section**, with a form and no code ([ADR 0408](https://github.com/journey-to-code-org/open.blog/blob/main/docs/adr/0408-a-theme-offers-components-an-owner-places-with-a-form-and-a-section-holds-only-a-name-and-checked-values.md)).
The web build writes `<card-room>` in that shape to `packages/web/dist/embed/openblog/` (also served at
`/embed/openblog/`):

1. Copy `card-room.js`, `card-room.zb`, `card-room.css` and `card-room.games.json` into the theme's
   `components/` folder.
2. Add the `components` entry from `theme-components.json` to the theme's `theme.json`, and list
   `components/card-room.css` under its `stylesheets`. With seasons, put it on the theme they extend.
3. In Admin: **Landing page → Add a section → Parlor**, then the parlor's address, the game and, for a
   Challenge button, your challenge link code.

The form's games come from `card-room.games.json` (the game setting's `choicesFrom`, open.blog
[ADR 0433](https://github.com/journey-to-code-org/open.blog/blob/main/docs/adr/0433-a-choice-setting-may-read-more-choices-from-a-file-of-the-themes-own.md)):
when the parlor gains a game, replace that one file. The widget itself asks the parlor for its
list (`/embed/games.json`) when it starts, so the copied `card-room.js` plays a new game without
being copied again.

With the `zubra` command installed where the site builds, open.blog renders the widget ahead, so
readers without JavaScript still see it and its link to the parlor.

## Hosting the parlor

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
| `CARDROOM_AI_KEY` | Optional: an Anthropic or OpenAI API key for the whole parlor, so every table's bots talk through a model (see **Bot talk from a model**) |
| `CARDROOM_AI_PROVIDER` | `anthropic` or `openai`, if the key doesn't say (a key starting `sk-ant-` is Anthropic's) |
| `CARDROOM_AI_MODEL` | The model for that key. Default: `claude-haiku-5-5` or `gpt-5.6-luna`. |
| `CARDROOM_AI_DAILY` | The most lines a day on that key, everyone together. Default 3000. |
| `CARDROOM_GITHUB_TOKEN` | Optional: turns on **Report a problem**. A GitHub token that may open issues on the repository below; keep it secret. |
| `CARDROOM_GITHUB_REPO` | Where reports are filed, as `owner/name`. Default `journey-to-code-org/open.parlor`. |
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
| `CARDROOM_WASM` | Where the built WebAssembly games are, if not `packages/wasm/dist` |
| `PORT` | The port to listen on (8787; Railway sets its own) |

The older `SPADES_*` names for these still work; `CARDROOM_*` wins if both are set. Keep the
database file's name (`spades.db`) as it is: renaming it leaves saved tables and houses behind.

### Backups

With a database (`CARDROOM_DB`), the server copies it once a day into `backups/` beside it
(`/data/backups` in the image) and keeps the newest seven. A copy is a whole SQLite database
(`cardroom-2026-11-14T09-30-00.db`), taken while the parlor stays open.

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

`.railway/railway.ts` describes the parlor as its own Railway project: the service built
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
- Leave the model empty and the parlor picks a small one the account has, or tap **Choose from
  this account's models** to pick from the account's own list.
- A table outside the house (a quick table, a challenge) talks through the house's account too
  when one of its members is sitting at it. The family notes are only used when everyone at that
  table is in the house.
- The key is tried before it's saved, kept on the server (encrypted when `CARDROOM_SECRET` is
  set) and never sent to a page again: admins see its last four characters. A changed or lost
  `CARDROOM_SECRET` means pasting the keys again.

**One key for everyone.** Whoever runs the parlor can set `CARDROOM_AI_KEY` instead (see
**Settings**). Then the bots at every table talk through it, in a house or not, and a house's
owner or admins only add their family notes, switch it off, or connect the house's own account
in its place. That account pays for everyone, so it has ceilings: 3000 lines a day in all
(`CARDROOM_AI_DAILY`), 600 for one house and 60 for a table outside a house. The same key also
tidies bug reports and game requests before players send them (see **Report a problem**). The key lives only in
the server's settings: it's never stored in the database or sent to a page.

open.parlor connects with an API key from the provider's developer console; signing in with a Claude
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
site in Safari, tap Share, **Add to Home Screen**, open open.parlor from there and turn them on.
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
   (`open.parlor on http://localhost:8080`). Railway sets `PORT` (usually 8080), which overrides
   the Dockerfile's 8787. Or set `PORT=8787` yourself and use 8787.

#### When it doesn't work

| What you see | Why | Fix |
| --- | --- | --- |
| "Application failed to respond", but the deploy log says `open.parlor on http://localhost:8080` | The domain points at another port | Set the domain's target port to the logged one |
| `/healthz` says `ok`, the page says "Build the web app first" | Built from `packages/server`, so the web app wasn't built | Root directory `/`, builder Dockerfile |
| Tables disappear after a deploy | No volume at `/data` | A volume mounted at `/data` |
| Players at one table see different games | More than one replica | One replica |
| A merge to `main` didn't change the site | The service isn't set to deploy on push | **Settings → Source**, auto-deploy on, or deploy from the dashboard |
| A Node version error in the build | The builder picked an old Node | `.nvmrc` pins 24; or set `RAILPACK_NODE_VERSION=24` |

Keep the parlor in a project of its own, so `railway config apply` can never touch another app.

See [docs/SPEC.md](docs/SPEC.md) for the original plan.
See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next: board games, dice, tiles and table sports.
