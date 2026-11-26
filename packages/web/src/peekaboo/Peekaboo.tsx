// Peekaboo: a game for a baby (about one year old) and the grown-ups who love him. Tap anywhere and
// a picture pops up and is named; lift the blanket; find the one asked for; sing Old MacDonald; read
// a little book of his own pictures. In a video call one parent is with the baby and the other on
// their own phone, seeing him, sharing the board, turning the pages and playing peekaboo with their
// face. Grammi can send surprises from her phone, which wait in his game until he opens them.
//
// The grown-ups' controls are behind a button that has to be held (a baby's slap opens nothing).
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ShareQr } from "../ShareQr";
import { stayAwake } from "../wifi/link";
import { apply, emptyBoard, hint, type BoardEvent, type BoardState, type Heard } from "./board";
import { joinLink, PeekabooCall, type CallState } from "./call";
import { frame, keepSnap, loadWords, saveWords, type Box, type Words } from "./keep";
import { Album, Family, MyPictures, restoreBox, SurpriseBox, Voices, WordsDiary } from "./panels";
import { HoldButton, MODES, ModePicker, Picture, Video } from "./parts";
import { SendSurprise } from "./SendSurprise";
import { playTune, singable, timing, verse } from "./song";
import { makeBook, pageText } from "./story";
import { loadJson, saveJson } from "./store";
import { CATEGORIES, createBag, familyThings, findRound, inPlay, mineThings, placeAt, randomFrom, THINGS, tidyMine, whereIs, type Category, type Mine, type Person, type Settings, type Thing } from "./things";
import { audioContext, dataUrl, loadFamily, loadSettings, playData, quiet, recording, saveFamily, saveSettings, say, sayAnd, sounds, tidyFamily } from "./voice";
import "./peekaboo.css";

/** A tap closer than this to the one before is the same slap: babies hit the screen with a whole hand, again and again. */
const TAP_GAP_MS = 650;
const POP_LIFE_MS = 5000;
const PEEK_SHOW_MS = 3500;
const FOUND_SHOW_MS = 2800;
const FACE_HIDE_MS = 1800;
/** A photo of his face this long after the moment: his reaction, not the tap. */
const SNAP_DELAY_MS = 700;
const SNAP_GAP_MS = 6000;
const GIFT_POLL_MS = 45_000;
const MINE_KEY = "peekaboo.mine";

/** A surprise from someone's phone, as the baby's device gets it. */
interface Gift {
  id: string;
  from: string;
  picture: string;
  photo: string;
  audio: string;
  note: string;
}

type Wire =
  | BoardEvent
  | { t: "sync"; settings: Settings; family: Person[]; mine: Mine[]; board: BoardState }
  /** A photo taken on one end, kept in both albums. */
  | { t: "snap"; photo: string; caption: string; at: number }
  /** A surprise being opened on the baby's screen (without its sound: that comes through the call). */
  | { t: "gift"; gift: Omit<Gift, "audio"> | null };

interface GameOptions {
  settings: Settings;
  family: Person[];
  mine: Mine[];
  practice: string[];
  /** This device plays the voice and sounds (the one with the baby). */
  speaks: boolean;
  /** This device moves the game on by itself; in a call only the baby's device does, so the two never both do. */
  leads: boolean;
  /** The story's pages are read out by the device (not when someone is reading them live on a call). */
  reads: boolean;
  send: (w: Wire) => void;
  /** A moment worth a photo of his face. */
  onMoment?: (caption: string) => void;
}

function useGame({ settings, family, mine, practice, speaks, leads, reads, send, onMoment }: GameOptions) {
  const [board, setBoard] = useState<BoardState>(() => emptyBoard(settings.mode));
  const [face, setFace] = useState(false);
  const [verseStart, setVerseStart] = useState(0);
  const boardRef = useRef(board);
  boardRef.current = board;
  const all = useMemo(() => new Map([...THINGS, ...familyThings(family), ...mineThings(mine)].map((th) => [th.id, th])), [family, mine]);
  const thing = useCallback((id: string) => all.get(id), [all]);
  const playing = useMemo(() => inPlay(settings, family, randomFrom(Date.now()), mine, practice), [settings, family, mine, practice]);
  const bag = useMemo(() => createBag(playing, randomFrom(Date.now() ^ 0x5bd1e995), practice), [playing, practice]);
  // Old MacDonald's animals: the ones in play, or every animal when animals aren't.
  const singBag = useMemo(() => createBag(singable(playing).length ? singable(playing) : singable(THINGS), randomFrom(Date.now() ^ 0x2545f491), practice), [playing, practice]);
  const lastTap = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const momentRef = useRef(onMoment);
  momentRef.current = onMoment;
  const stopTune = useRef<() => void>(() => {});

  const hear = useCallback(
    (heard: Heard | null) => {
      if (!heard || !speaks) return;
      if (heard.sound) sounds[heard.sound]();
      if (heard.text) void say(heard.text, heard.key);
    },
    [speaks],
  );

  const set = (state: BoardState) => {
    boardRef.current = state;
    setBoard(state);
  };

  /** Apply an event here; `share` sends it to the other end as well. */
  const run = useCallback(
    (event: BoardEvent, share: boolean) => {
      if (share) send(event);
      if (event.t === "face") {
        setFace(true);
        setTimeout(() => {
          setFace(false);
          hear(apply(boardRef.current, event, thing, settingsRef.current).heard);
        }, FACE_HIDE_MS);
        return;
      }
      const before = boardRef.current;
      const { state, heard } = apply(before, event, thing, settingsRef.current);
      set(state);
      if (event.t === "verse" && state.verse && state !== before) {
        // The verse: the grown-up's own singing if they recorded it, the tune otherwise. Each end ends it by itself.
        const animal = thing(event.id)!;
        const lines = verse(animal);
        setVerseStart(performance.now());
        const end = () => set(apply(boardRef.current, { t: "sung", key: event.key }, thing, settingsRef.current).state);
        const length = timing(lines).length + 600;
        if (speaks) {
          void recording(`song:${animal.id}`)
            .catch(() => null)
            .then(async (clip) => {
              if (clip) {
                const over = await sayAnd("", `song:${animal.id}`);
                await over;
                end();
              } else {
                stopTune.current = playTune(lines, audioContext());
                setTimeout(end, length);
              }
            });
        } else setTimeout(end, length);
        return;
      }
      hear(heard);
      if (heard?.sound === "cheer" && event.t === "pick") momentRef.current?.(`Found the ${thing(event.id)?.word.toLowerCase()}!`);
      if (event.t === "peek" && heard) momentRef.current?.(`Peekaboo, ${thing(before.hidden!.id)?.word.toLowerCase()}!`);
    },
    [thing, hear, send, speaks],
  );

  useEffect(() => () => stopTune.current(), []);

  // A new mode starts on an empty board.
  useEffect(() => {
    if (boardRef.current.mode !== settings.mode) {
      stopTune.current();
      set(emptyBoard(settings.mode));
    }
  }, [settings.mode]);

  // Pictures that popped up fade away by themselves (here only: each end fades its own).
  useEffect(() => {
    if (!board.popped.length) return;
    const oldest = board.popped[0]!;
    const timer = setTimeout(() => setBoard((b) => ({ ...b, popped: b.popped.filter((p) => p.key !== oldest.key) })), POP_LIFE_MS);
    return () => clearTimeout(timer);
  }, [board.popped]);

  // The device that leads moves the game along: a new picture under the blanket, the next question, a new book.
  useEffect(() => {
    if (!leads || !playing.length) return;
    if (board.mode === "peek" && (!board.hidden || board.hidden.open)) {
      const timer = setTimeout(() => run({ t: "hide", id: bag.next().id }, true), board.hidden ? PEEK_SHOW_MS : 200);
      return () => clearTimeout(timer);
    }
    if (board.mode === "find" && (!board.round || board.round.found) && playing.length >= 2) {
      const timer = setTimeout(() => run({ t: "ask", ...findRound(playing, settings.choices, Math.random, board.round?.target) }, true), board.round ? FOUND_SHOW_MS : 400);
      return () => clearTimeout(timer);
    }
    if (board.mode === "story" && !board.book) {
      const timer = setTimeout(() => run({ t: "book", pages: makeBook(playing, Math.random), read: reads }, true), 300);
      return () => clearTimeout(timer);
    }
  }, [leads, board.mode, board.hidden, board.round, board.book, playing, bag, run, settings.choices, reads]);

  /** Turn the story's page: forward, back, or (from the last page) a new book. */
  const turn = useCallback(
    (by: 1 | -1) => {
      const book = boardRef.current.book;
      if (!book) return;
      if (book.page === book.pages.length && by === 1) return run({ t: "book", pages: makeBook(playing, Math.random), read: reads }, true);
      run({ t: "page", n: book.page + by, read: reads }, true);
    },
    [run, playing, reads],
  );

  /** A tap on the board (x and y as fractions of it), or on a picture. */
  const tap = useCallback(
    (x: number, y: number, on?: string) => {
      const now = performance.now();
      if (now - lastTap.current < TAP_GAP_MS) return;
      lastTap.current = now;
      const b = boardRef.current;
      if (b.mode === "tap" && playing.length) run({ t: "pop", id: bag.next().id, ...placeAt(x, y), key: Math.floor(Math.random() * 2 ** 31) }, true);
      else if (b.mode === "peek" && b.hidden && !b.hidden.open) run({ t: "peek" }, true);
      else if (b.mode === "find" && b.round && !b.round.found) run(on ? { t: "pick", id: on } : { t: "again" }, true);
      else if (b.mode === "sing" && !b.verse) run({ t: "verse", id: singBag.next().id, key: Math.floor(Math.random() * 2 ** 31) }, true);
      else if (b.mode === "story") turn(x < 0.5 ? -1 : 1);
    },
    [playing, bag, singBag, run, turn],
  );

  return { board, setBoard, boardRef, face, thing, run, tap, turn, playing, verseStart };
}

/** The words of the verse being sung, the line being sung now the biggest. */
function Lyrics({ animal, start }: { animal: Thing; start: number }) {
  const lines = useMemo(() => verse(animal), [animal]);
  const { starts } = useMemo(() => timing(lines), [lines]);
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, []);
  const at = now - start;
  let current = 0;
  starts.forEach((s, i) => at >= s && (current = i));
  return (
    <div className="pk-lyrics" aria-live="polite">
      {lines.map((line, i) =>
        Math.abs(i - current) <= 1 ? (
          <p key={i} className={`${i === current ? "pk-now" : ""}${line.sound ? " pk-sound" : ""}`}>
            {line.text}
          </p>
        ) : null,
      )}
    </div>
  );
}

/** The board: what the baby sees and taps. */
function Board({ game, children }: { game: ReturnType<typeof useGame>; children?: React.ReactNode }) {
  const { board, thing, tap } = game;
  const el = useRef<HTMLDivElement>(null);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-own-tap]")) return;
    const box = el.current!.getBoundingClientRect();
    const on = (e.target as HTMLElement).closest<HTMLElement>("[data-thing]")?.dataset.thing;
    tap((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height, on);
  };
  const target = board.round ? thing(board.round.target) : undefined;
  const hidden = board.hidden ? thing(board.hidden.id) : undefined;
  const singing = board.verse ? thing(board.verse.id) : undefined;
  const book = board.book;
  const page = book && book.page < book.pages.length ? thing(book.pages[book.page]!) : undefined;
  return (
    <div ref={el} className={`pk-board pk-mode-${board.mode}`} onPointerDown={down} role="application" aria-label="The baby's board: tap anywhere">
      {board.mode === "tap" && !board.popped.length && <p className="pk-invite" aria-hidden="true">👋</p>}
      {board.popped.map((p) => {
        const th = thing(p.id);
        return th ? (
          <div key={p.key} className="pk-pop" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
            <Picture thing={th} />
          </div>
        ) : null;
      })}
      {board.mode === "peek" && hidden && (
        <div className={`pk-peek${board.hidden!.open ? " pk-open" : ""}`}>
          <Picture thing={hidden} />
          <div className="pk-blanket" aria-hidden="true" />
        </div>
      )}
      {board.mode === "find" && board.round && target && (
        <>
          <p className="pk-question">{whereIs(target)}</p>
          <div className="pk-choices">
            {board.round.choices.map((id) => {
              const th = thing(id);
              if (!th) return null;
              const state = board.round!.found ? (id === board.round!.target ? "pk-found" : "pk-faded") : id === board.round!.wrong ? "pk-wiggle" : hint(board) && id === board.round!.target ? "pk-hint" : "";
              return (
                <button key={`${board.round!.target}:${id}`} type="button" data-thing={id} className={`pk-choice ${state}`} aria-label={th.word}>
                  <Picture thing={th} />
                </button>
              );
            })}
          </div>
          {board.round.found && <Stars />}
        </>
      )}
      {board.mode === "sing" &&
        (singing ? (
          <div className="pk-sing" key={board.verse!.key}>
            <div className="pk-bounce">
              <Picture thing={singing} />
            </div>
            <Lyrics animal={singing} start={game.verseStart} />
          </div>
        ) : (
          <div className="pk-sing-invite" aria-hidden="true">
            <span>🚜</span>
            <p>🎵 Tap to sing!</p>
          </div>
        ))}
      {board.mode === "story" && book && (
        <div className="pk-book" key={book.page}>
          {page ? (
            <>
              <Picture thing={page} />
              <p className="pk-page-text">{pageText(page)}</p>
            </>
          ) : (
            <>
              <div className="pk-goodnight">
                {book.pages.map((id) => {
                  const th = thing(id);
                  return th ? <Picture key={id} thing={th} /> : null;
                })}
              </div>
              <p className="pk-page-text">🌙 Good night!</p>
            </>
          )}
          <div className="pk-dots" aria-label={`Page ${book.page + 1} of ${book.pages.length + 1}`}>
            {[...book.pages, "night"].map((id, i) => (
              <span key={i} className={i === book.page ? "pk-on" : ""} />
            ))}
          </div>
          <span className="pk-turn pk-turn-back" aria-hidden="true">
            ‹
          </span>
          <span className="pk-turn pk-turn-next" aria-hidden="true">
            ›
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

function Stars() {
  return (
    <div className="pk-stars" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} style={{ ["--i" as string]: i }}>
          ⭐
        </span>
      ))}
    </div>
  );
}

/** A surprise, opened: the picture or photo, who it's from, and their words. */
function GiftOpen({ gift, thing, onClose }: { gift: Omit<Gift, "audio">; thing: (id: string) => Thing | undefined; onClose?: () => void }) {
  const th = gift.picture ? thing(gift.picture) : undefined;
  return (
    <div className="pk-gift-open" data-own-tap onPointerDown={(e) => (e.stopPropagation(), onClose?.())}>
      <div className="pk-ribbon" aria-hidden="true" />
      {gift.photo ? <img className="pk-gift-photo" src={gift.photo} alt="" /> : th ? <Picture thing={th} /> : <span className="pk-emoji">🎁</span>}
      <p className="pk-gift-from">From {gift.from} 💝</p>
      {gift.note && <p className="pk-gift-note">{gift.note}</p>}
      <Stars />
    </div>
  );
}

const STATE_WORDS: Record<CallState, string> = {
  waiting: "Waiting for them to open the link…",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  ended: "The call has ended.",
};

/** Settings kept here, the mine list and the words diary, with saving. */
function useKept<T>(load: () => T, save: (v: T) => unknown) {
  const [value, setValue] = useState(load);
  const change = useCallback(
    (next: T) => {
      setValue(next);
      save(next);
    },
    [save],
  );
  return [value, change] as const;
}
const loadMine = () => loadJson(MINE_KEY, tidyMine);
const saveMine = (m: Mine[]) => saveJson(MINE_KEY, m);

/** The device with the baby (or the only device, with no call). */
function WithBaby({ onLeave }: { onLeave: () => void }) {
  const [settings, setSettings] = useState(loadSettings);
  const [family, setFamily] = useState(loadFamily);
  const [mine, setMine] = useKept(loadMine, saveMine);
  const [words, setWords] = useKept<Words>(loadWords, saveWords);
  const [box, setBox] = useState<Box | null>(restoreBox);
  const [started, setStarted] = useState(false);
  const [panel, setPanel] = useState(false);
  const [call, setCall] = useState<PeekabooCall<Wire> | null>(null);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [callProblem, setCallProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [albumVersion, setAlbumVersion] = useState(0);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [opened, setOpened] = useState<Gift | null>(null);
  const [closable, setClosable] = useState(false);
  const openedIds = useRef(new Set<string>());
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const camVideo = useRef<HTMLVideoElement | null>(null);
  const callRef = useRef(call);
  callRef.current = call;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const familyRef = useRef(family);
  familyRef.current = family;
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const send = useCallback((w: Wire) => callRef.current?.send(w), []);
  const live = !!call && callState !== "ended";
  const connected = live && callState === "connected";

  // Photos of his face at the good moments, when the grown-ups turned that on.
  const lastSnap = useRef(0);
  const onMoment = useCallback(
    (caption: string) => {
      if (!settingsRef.current.snaps || performance.now() - lastSnap.current < SNAP_GAP_MS) return;
      lastSnap.current = performance.now();
      setTimeout(async () => {
        const photo = await frame(camVideo.current, caption);
        if (!photo) return;
        await keepSnap(photo, caption).catch(() => {});
        setAlbumVersion((v) => v + 1);
        if (callRef.current?.open) send({ t: "snap", photo: await dataUrl(photo), caption, at: Date.now() });
      }, SNAP_DELAY_MS);
    },
    [send],
  );

  const game = useGame({ settings, family, mine, practice: words.practice, speaks: true, leads: true, reads: !connected, send, onMoment });

  const changeSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
    send({ t: "settings", settings: next });
  };
  const changeFamily = (next: Person[]) => {
    setFamily(next);
    saveFamily(next);
    send({ t: "family", family: next });
  };
  const changeMine = (next: Mine[]) => {
    setMine(next);
    send({ t: "mine", mine: next });
  };

  // The camera for snapshots: the call's own when there is a call, this page's when there isn't.
  useEffect(() => {
    if (!started || !settings.snaps) return setCamera(null);
    if (live && call!.local.getVideoTracks().length) return setCamera(call!.local);
    let own: MediaStream | null = null;
    let stopped = false;
    void navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 } }, audio: false })
      .then((s) => (stopped ? s.getTracks().forEach((t) => t.stop()) : ((own = s), setCamera(s))))
      .catch(() => setCamera(null));
    return () => {
      stopped = true;
      own?.getTracks().forEach((t) => t.stop());
    };
  }, [started, settings.snaps, live, call]);

  // What the other end does arrives here.
  useEffect(() => {
    if (!call) return;
    const offs = [
      call.on("state", setCallState),
      call.on("remote", setRemote),
      // The other phone starts from what this one has: the settings, the family, their pictures and the board.
      call.on("open", () => call.send({ t: "sync", settings: settingsRef.current, family: familyRef.current, mine: mineRef.current, board: game.boardRef.current })),
      call.on("message", (w) => {
        if (w.t === "sync" || w.t === "family" || w.t === "mine" || w.t === "gift") return; // these are this device's to say
        if (w.t === "snap") {
          void fetch(w.photo)
            .then((r) => r.blob())
            .then((b) => keepSnap(b, w.caption, w.at))
            .then(() => setAlbumVersion((v) => v + 1))
            .catch(() => {});
          return;
        }
        if (w.t === "settings") {
          const next = { ...settingsRef.current, ...w.settings, snaps: settingsRef.current.snaps };
          setSettings(next);
          saveSettings(next);
          return;
        }
        game.run(w, false);
      }),
    ];
    setCallState(call.state);
    return () => offs.forEach((off) => off());
  }, [call, game.run, game.boardRef]);

  // Surprises from Grammi: looked for when the game starts or the settings close, and every so often while it's played.
  useEffect(() => {
    if (!started || !box || panel) return;
    let stop = false;
    const look = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch(`/surprises/boxes/${box.box}?key=${box.key}`, { cache: "no-store" }).catch(() => null);
      if (stop || !r?.ok) return;
      const { waiting } = (await r.json()) as { waiting: Gift[] };
      // One opened here a moment ago may not be marked opened on the server yet.
      setGifts(waiting.filter((g) => !openedIds.current.has(g.id)));
    };
    void look();
    const timer = setInterval(() => void look(), GIFT_POLL_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [started, box, panel]);

  const openGift = async (gift: Gift) => {
    openedIds.current.add(gift.id);
    setGifts((all) => all.filter((g) => g.id !== gift.id));
    setOpened(gift);
    setClosable(false);
    const { audio: _audio, ...shown } = gift;
    send({ t: "gift", gift: shown });
    sounds.cheer();
    void fetch(`/surprises/boxes/${box!.box}/${gift.id}/opened`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: box!.key }) }).catch(() => {});
    onMoment(`A surprise from ${gift.from}!`);
    const th = gift.picture ? game.thing(gift.picture) : undefined;
    // A slap can't close it before it's been heard; after that a tap does, or it closes by itself.
    const sure = setTimeout(() => setClosable(true), 15_000);
    await new Promise((w) => setTimeout(w, 500));
    if (gift.audio) await playData(gift.audio);
    else await (await sayAnd(`A surprise from ${gift.from}!`));
    if (th) await (await sayAnd(th.say, th.id));
    clearTimeout(sure);
    setClosable(true);
    setTimeout(() => setOpened((o) => (o?.id === gift.id ? (send({ t: "gift", gift: null }), null) : o)), 10_000);
  };
  const closeGift = () => {
    if (!closable) return;
    quiet();
    setOpened(null);
    send({ t: "gift", gift: null });
  };

  useEffect(() => (started ? stayAwake() : undefined), [started]);
  useEffect(() => () => void callRef.current?.hangUp(), []);

  const start = () => {
    // A grown-up's tap: the one that lets the page make sounds and go full screen.
    sounds.pop();
    void say("Hi!");
    void document.documentElement.requestFullscreen?.().catch(() => {});
    setStarted(true);
    setPanel(false);
  };
  const leave = () => {
    quiet();
    void call?.hangUp();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onLeave();
  };
  const startCall = async () => {
    setCallProblem(null);
    try {
      const c = await PeekabooCall.start<Wire>();
      setCall(c);
      if (c.note) setCallProblem(c.note);
    } catch (e) {
      setCallProblem((e as Error).message);
    }
  };
  const hangUp = () => {
    void call?.hangUp();
    setCall(null);
    setCallState(null);
    setRemote(null);
  };
  const link = call ? joinLink(call.code) : "";
  const shareLink = async () => {
    if (typeof navigator.share === "function") return void navigator.share({ title: "Peekaboo", text: "Come play Peekaboo with us", url: link }).catch(() => {});
    await navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const toggle = (c: Category) => {
    const has = settings.categories.includes(c);
    const categories = has ? settings.categories.filter((x) => x !== c) : [...settings.categories, c];
    if (categories.length) changeSettings({ ...settings, categories });
  };
  const chosenThings = [...THINGS, ...familyThings(family), ...mineThings(mine)].filter((th) => settings.categories.includes(th.category));

  return (
    <main className="pk-root" onContextMenu={(e) => e.preventDefault()}>
      <Board game={game}>
        {live && (
          <div className={`pk-face${game.face ? " pk-face-hidden" : ""}`} aria-hidden={!remote}>
            {remote ? <Video stream={remote} label="The other parent, on the call" className="pk-face-video" /> : <span className="pk-face-wait">📞</span>}
            <div className="pk-blanket" aria-hidden="true" />
          </div>
        )}
        {started && !opened && gifts.length > 0 && (
          <button type="button" className="pk-gift" data-own-tap onPointerDown={(e) => (e.stopPropagation(), void openGift(gifts[0]!))} aria-label={`A surprise from ${gifts[0]!.from}: tap to open`}>
            <span aria-hidden="true">🎁</span>
          </button>
        )}
        {opened && <GiftOpen gift={opened} thing={game.thing} onClose={closeGift} />}
      </Board>
      {camera && <Video stream={camera} muted label="" className="pk-hidden-camera" onVideo={(v) => (camVideo.current = v)} />}
      {started && !panel && <HoldButton onOpen={() => setPanel(true)} />}

      {(!started || panel) && (
        <div className="pk-panel" role="dialog" aria-modal="true" aria-labelledby="pk-title">
          <div className="pk-panel-inner">
            <h2 id="pk-title">
              <span aria-hidden="true">🙈</span> Peekaboo
            </h2>
            <p className="fine">For a baby and a grown-up, together. Say the words with him, point, and wait for him to tap. To get back here during play, hold the 🔒 in the corner.</p>
            <button type="button" className="pk-go" onClick={start}>
              {started ? "Back to the game" : "Start"}
            </button>

            <section className="pk-section">
              <h3>What to play</h3>
              <ModePicker mode={settings.mode} onMode={(mode) => changeSettings({ ...settings, mode })} />
              <p className="fine">{MODES.find((m) => m.id === settings.mode)!.what}</p>
              <div className="pk-kinds">
                {CATEGORIES.map((c) => (
                  <label key={c.id} className="pk-check">
                    <input type="checkbox" checked={settings.categories.includes(c.id)} onChange={() => toggle(c.id)} /> <span aria-hidden="true">{c.emoji}</span> {c.name}
                  </label>
                ))}
              </div>
              <label className="pk-check">
                <input type="checkbox" checked={settings.few} onChange={(e) => changeSettings({ ...settings, few: e.target.checked })} /> A few pictures, over and over (how words are learned)
              </label>
              <label className="pk-check">
                <input type="checkbox" checked={settings.sounds} onChange={(e) => changeSettings({ ...settings, sounds: e.target.checked })} /> Say the sound too ("Cow! Moo!")
              </label>
              {settings.mode === "find" && (
                <label className="pk-check">
                  <input type="checkbox" checked={settings.choices === 3} onChange={(e) => changeSettings({ ...settings, choices: e.target.checked ? 3 : 2 })} /> Three to choose from (harder)
                </label>
              )}
              <label className="pk-check">
                <input type="checkbox" checked={settings.snaps} onChange={(e) => changeSettings({ ...settings, snaps: e.target.checked })} /> 📸 Take his photo when he finds one, lifts the blanket or opens a surprise (uses the camera; photos stay on this device)
              </label>
            </section>

            <section className="pk-section">
              <h3>Video call</h3>
              {!call ? (
                <>
                  <p className="fine">Call the other parent (or Grammi): they see him and the board, can tap pictures onto his screen, turn the story's pages, take photos, and play peekaboo with their own face.</p>
                  <button type="button" className="secondary" onClick={() => void startCall()}>
                    📞 Start a call
                  </button>
                </>
              ) : (
                <>
                  <p className="pk-call-state">{STATE_WORDS[callState ?? call.state]}</p>
                  {callState !== "connected" && callState !== "ended" && (
                    <>
                      <p className="fine">Send them this link:</p>
                      <input className="pk-link" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="The link to join the call" />
                      <div className="pk-row">
                        <button type="button" className="secondary" onClick={() => void shareLink()}>
                          {copied ? "Copied" : typeof navigator.share === "function" ? "Share the link" : "Copy the link"}
                        </button>
                        <ShareQr url={link} label="A QR code for joining the call" what="Point their phone's camera at it" />
                      </div>
                    </>
                  )}
                  <button type="button" className="secondary" onClick={hangUp}>
                    {callState === "ended" ? "Close" : "Hang up"}
                  </button>
                </>
              )}
              {callProblem && <p className="fine pk-problem">{callProblem}</p>}
            </section>

            <SurpriseBox box={box} onBox={setBox} />
            <Family family={family} onChange={changeFamily} />
            <MyPictures mine={mine} onChange={changeMine} />
            <WordsDiary words={words} things={chosenThings} onChange={setWords} />
            <Voices things={chosenThings} title="Your voices" blurb={'Record yourself saying each one ("Cow! Moo!"). Your voice is played in place of the computer\'s. Recordings stay on this device.'} />
            <Voices things={singable(THINGS)} prefix="song:" most={40_000} title="Your singing (Old MacDonald)" blurb="Record yourself singing a verse for an animal (up to 40 seconds): it plays in place of the tune when that animal's verse comes up." />
            <Album version={albumVersion} />

            <button type="button" className="secondary" onClick={leave}>
              Leave Peekaboo
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/** The other parent's (or Grammi's) phone: the baby on the call, the same board, and buttons to play along. */
function JoinCall({ code, onLeave }: { code: string; onLeave: () => void }) {
  const [call, setCall] = useState<PeekabooCall<Wire> | null>(null);
  const [state, setState] = useState<CallState | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [family, setFamily] = useState<Person[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [gift, setGift] = useState<Omit<Gift, "audio"> | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [albumVersion, setAlbumVersion] = useState(0);
  const [flash, setFlash] = useState(false);
  const babyVideo = useRef<HTMLVideoElement | null>(null);
  const callRef = useRef(call);
  callRef.current = call;
  const send = useCallback((w: Wire) => callRef.current?.send(w), []);
  // The baby's device speaks and leads; this one only taps, and hears it all through the call. Its pages are read live.
  const game = useGame({ settings, family, mine, practice: [], speaks: false, leads: false, reads: false, send });

  useEffect(() => {
    if (!call) return;
    const offs = [
      call.on("state", setState),
      call.on("remote", setRemote),
      call.on("message", (w) => {
        if (w.t === "sync") {
          setSettings(w.settings);
          setFamily(tidyFamily(w.family));
          setMine(tidyMine(w.mine));
          game.boardRef.current = w.board;
          game.setBoard(w.board);
          return;
        }
        if (w.t === "settings") return setSettings(w.settings);
        if (w.t === "family") return setFamily(tidyFamily(w.family));
        if (w.t === "mine") return setMine(tidyMine(w.mine));
        if (w.t === "gift") return setGift(w.gift);
        if (w.t === "snap") {
          void fetch(w.photo)
            .then((r) => r.blob())
            .then((b) => keepSnap(b, w.caption, w.at))
            .then(() => setAlbumVersion((v) => v + 1))
            .catch(() => {});
          return;
        }
        game.run(w, false);
      }),
    ];
    setState(call.state);
    return () => offs.forEach((off) => off());
  }, [call, game.run, game.boardRef, game.setBoard]);
  useEffect(() => (call ? stayAwake() : undefined), [call]);
  useEffect(() => () => void callRef.current?.hangUp(), []);

  const join = async () => {
    setJoining(true);
    setProblem(null);
    try {
      const c = await PeekabooCall.join<Wire>(code);
      setCall(c);
      if (c.note) setProblem(c.note);
    } catch (e) {
      setProblem((e as Error).message);
    }
    setJoining(false);
  };
  const leave = () => {
    void call?.hangUp();
    onLeave();
  };
  const setMode = (mode: Settings["mode"]) => {
    const next = { ...settings, mode };
    setSettings(next);
    send({ t: "settings", settings: next });
  };
  const snap = async () => {
    const caption = "Playing Peekaboo";
    const photo = await frame(babyVideo.current, caption);
    if (!photo) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 300);
    await keepSnap(photo, caption).catch(() => {});
    setAlbumVersion((v) => v + 1);
    send({ t: "snap", photo: await dataUrl(photo), caption, at: Date.now() });
  };

  if (!call || state === "ended") {
    return (
      <main className="pk-join">
        <h1>
          <span aria-hidden="true">🙈</span> Peekaboo
        </h1>
        {state === "ended" ? (
          <p>The call has ended. Ask for a new link to call again.</p>
        ) : (
          <>
            <p>You've been asked to play Peekaboo on a video call. You'll see the baby and the game, can tap pictures onto their screen, read them a story, and play peekaboo with your face.</p>
            <button type="button" className="pk-go" disabled={joining || !code} onClick={() => void join()}>
              {joining ? "Joining…" : "📞 Join with camera"}
            </button>
          </>
        )}
        {problem && <p className="pk-problem">{problem}</p>}
        <button type="button" className="secondary" onClick={leave}>
          Go to the parlor
        </button>
      </main>
    );
  }

  const book = game.board.book;
  return (
    <main className="pk-root pk-remote">
      <div className={`pk-stage${flash ? " pk-flash" : ""}`}>
        {remote ? <Video stream={remote} label="The baby, on the call" className="pk-baby" onVideo={(v) => (babyVideo.current = v)} /> : <p className="pk-call-state">{STATE_WORDS[state ?? call.state]}</p>}
        <div className={`pk-self${game.face ? " pk-face-hidden" : ""}`}>
          <Video stream={call.local} muted mirror label="You" className="pk-self-video" />
          <div className="pk-blanket" aria-hidden="true" />
        </div>
        {state !== "connected" && remote && <p className="pk-call-state pk-over">{STATE_WORDS[state ?? call.state]}</p>}
      </div>
      <Board game={game}>{gift && <GiftOpen gift={gift} thing={game.thing} />}</Board>
      <div className="pk-controls">
        <ModePicker mode={settings.mode} onMode={setMode} />
        {settings.mode === "story" && book && (
          <div className="pk-row pk-story-row">
            <button type="button" className="secondary" disabled={book.page === 0} onClick={() => game.turn(-1)}>
              ‹ Back
            </button>
            <span className="fine">You read it to him: the pages turn on his screen too.</span>
            <button type="button" className="secondary" onClick={() => game.turn(1)}>
              {book.page === book.pages.length ? "New book" : "Next ›"}
            </button>
          </div>
        )}
        <div className="pk-row">
          <button type="button" className="pk-peekaboo" disabled={game.face} onClick={() => game.run({ t: "face" }, true)}>
            🙈 Peekaboo!
          </button>
          <button type="button" className="secondary" disabled={!remote} onClick={() => void snap()} aria-label="Take a photo of the baby">
            📸
          </button>
          <button type="button" className="secondary" onClick={() => setAlbumOpen(true)} aria-label="The album">
            🖼
          </button>
          <button
            type="button"
            className="secondary"
            aria-pressed={!mic}
            onClick={() => {
              call.setMicrophone(!mic);
              setMic(!mic);
            }}
          >
            {mic ? "🎙 Mute" : "🔇 Unmute"}
          </button>
          <button
            type="button"
            className="secondary"
            aria-pressed={!cam}
            onClick={() => {
              call.setCamera(!cam);
              setCam(!cam);
            }}
          >
            {cam ? "📷 Off" : "📷 On"}
          </button>
          <button type="button" className="pk-hangup" onClick={leave}>
            Hang up
          </button>
        </div>
      </div>
      {albumOpen && (
        <div className="pk-panel" role="dialog" aria-modal="true" aria-label="The album">
          <div className="pk-panel-inner">
            <Album version={albumVersion} open />
            <button type="button" className="pk-go" onClick={() => setAlbumOpen(false)}>
              Back to the call
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export function Peekaboo({ onLeave }: { onLeave: () => void }) {
  const q = new URLSearchParams(location.search).get("peekaboo");
  const code = decodeURIComponent(location.hash.slice(1));
  if (q === "join") return <JoinCall code={code} onLeave={onLeave} />;
  if (q === "send") return <SendSurprise box={code} onLeave={onLeave} />;
  return <WithBaby onLeave={onLeave} />;
}
