// Make a bowling lane: paint the lane between the foul line and the pins, a piece a square (a crate,
// sand, water, a slope, a toadstool bumper), see it as the table draws it, bowl a game on it against
// the computer, and save it, for yourself or shared. Shared lanes are in everyone's Lane list in
// Bowling's setup. Kept on the server with the Mini Golf courses (see server/src/courses.ts).
import { bowling, LANES, newBowling, tenFrames, type SportView } from "@journey-to-code/games";
import { buildLane, LANE_LIMITS, LANE_PIECES, starterLane, type CustomLane, type LanePiece, type LaneTest } from "@open-parlor/courses";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadName } from "../storage";
import { learnLane, lanes, type SavedLane } from "./coursesApi";
import { TablePreview } from "./HolePreview";
import { usePlaytests } from "./usePlaytest";

const RATED: Record<LaneTest["rating"], string> = { easy: "Easy", fair: "Fair", hard: "Hard", "very hard": "Very hard", unplayable: "Can't be bowled" };

const PALETTE: { piece: LanePiece; glyph: string }[] = [
  { piece: "#", glyph: "" },
  { piece: "s", glyph: "" },
  { piece: "w", glyph: "" },
  { piece: "^", glyph: "↑" },
  { piece: "v", glyph: "↓" },
  { piece: "<", glyph: "←" },
  { piece: ">", glyph: "→" },
  { piece: "o", glyph: "●" },
  { piece: ".", glyph: "" },
];
const GLYPH = Object.fromEntries(PALETTE.map((p) => [p.piece, p.glyph])) as Record<string, string>;
/** A class name for each piece: what colour a square is. */
const CLASS: Record<string, string> = { ".": "lane-open", "#": "crate", s: "sand", w: "water", "^": "lane-slope", v: "lane-slope", "<": "lane-slope", ">": "lane-slope", o: "lane-bumper" };
const HISTORY = 40;
let drafts = 0;
let previews = 0;

/** The lane being made, kept for this tab: it survives a practice game and coming back. */
const DRAFT = "open-parlor:lane-draft";
function loadDraft(id: string): { lane: CustomLane; shared: boolean } | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT) ?? "null") as { id: string; lane: CustomLane; shared: boolean } | null;
    return d && d.id === id && typeof d.lane?.cells === "string" ? d : null;
  } catch {
    return null;
  }
}
function saveDraft(id: string, lane: CustomLane, shared: boolean) {
  try {
    sessionStorage.setItem(DRAFT, JSON.stringify({ id, lane, shared }));
  } catch {}
}

/** The lane as a table draws it: put in LANES under a preview id (the last preview's taken out), and a game's view of it. */
function previewOf(lane: CustomLane): SportView["table"] {
  const id = `custom-lanepreview${++previews}-1`;
  const old = LANES.findIndex((l) => l.id.startsWith("custom-lanepreview"));
  if (old >= 0) LANES.splice(old, 1);
  LANES.push(buildLane(lane, id));
  return bowling.view(newBowling({ ...tenFrames, lane: id }, 1, 1), 0).table;
}

export function LaneEditor({
  id,
  onLeave,
  onPlay,
  onSaved,
}: {
  /** The lane to change, or "new". */
  id: string;
  onLeave: () => void;
  /** Bowl on this lane against the computer: its game id (a draft one if it isn't saved), and its name. */
  onPlay: (lane: string, name: string) => void;
  /** Saved for the first time: the page's address should say which lane it is now. */
  onSaved: (id: string) => void;
}) {
  const draft = loadDraft(id);
  const [lane, setLane] = useState<CustomLane>(() => draft?.lane ?? starterLane());
  const [saved, setSaved] = useState<SavedLane | null>(null);
  const [shared, setShared] = useState(draft?.shared ?? false);
  const [piece, setPiece] = useState<LanePiece>("#");
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(id !== "new");
  const [replay, setReplay] = useState<boolean>(false);
  const history = useRef<CustomLane[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const painting = useRef<[number, number] | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  // A lane of yours to change; someone else's, to start a copy from.
  useEffect(() => {
    if (id === "new") return;
    let live = true;
    lanes.get(id).then(
      (l) => {
        if (!live) return;
        const kept = loadDraft(id);
        setLane(kept?.lane ?? (l.mine ? l.course : { ...l.course, name: `${l.course.name} (copy)`.slice(0, LANE_LIMITS.name) }));
        setSaved(l.mine ? l : null);
        setShared(kept?.shared ?? (l.mine ? l.shared : false));
        if (!l.mine) setNote(`This is ${l.author}'s lane: what you save is a copy of your own.`);
        setLoading(false);
      },
      (e: Error) => {
        if (!live) return;
        setProblem(e.message);
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (!loading) saveDraft(saved?.id ?? id, lane, shared);
  }, [lane, shared, saved, id, loading]);

  // The computer bowls at it, off the page's thread, once painting stops for a moment.
  const open = lane.cells.includes(".");
  const [test] = usePlaytests<LaneTest>("bowling", [open ? lane : null]);
  useEffect(() => setReplay(false), [lane.cells]);
  const problems: string[] | null = !open ? ["Leave some open lane for the ball to roll on."] : !test ? null : test.rating === "unplayable" ? ["No ball from the foul line gets to the pins. Leave a way through, or something that turns the ball towards them."] : [];

  const table = useMemo(() => previewOf(lane), [lane.cells]);
  const unsaved = !saved || JSON.stringify(saved.course) !== JSON.stringify(lane) || saved.shared !== shared;
  const ready = problems !== null && problems.length === 0;

  function remember() {
    history.current = [...history.current.slice(-(HISTORY - 1)), lane];
    setCanUndo(true);
  }
  function undo() {
    const last = history.current.pop();
    if (last) setLane(last);
    setCanUndo(history.current.length > 0);
  }
  function paint(to: [number, number], from: [number, number] = to) {
    const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
    setLane((l) => {
      let cells = l.cells;
      for (let k = 0; k <= steps; k++) {
        const col = Math.round(from[0] + ((to[0] - from[0]) * k) / (steps || 1));
        const row = Math.round(from[1] + ((to[1] - from[1]) * k) / (steps || 1));
        const i = row * l.cols + col;
        cells = cells.slice(0, i) + piece + cells.slice(i + 1);
      }
      return cells === l.cells ? l : { ...l, cells };
    });
  }
  function squareAt(e: React.PointerEvent): [number, number] | null {
    const box = grid.current?.getBoundingClientRect();
    if (!box) return null;
    const col = Math.floor(((e.clientX - box.left) / box.width) * lane.cols);
    const row = Math.floor(((e.clientY - box.top) / box.height) * lane.rows);
    return col >= 0 && row >= 0 && col < lane.cols && row < lane.rows ? [col, row] : null;
  }

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      const after = saved ? await lanes.update(saved.id, { course: lane, shared }) : await lanes.create(lane, loadName() || "Someone", shared);
      setSaved(after);
      setLane(after.course);
      setNote(after.shared ? "Saved, and shared: everyone can pick it in Bowling now." : "Saved. Only you see it in Bowling; share it when it's ready.");
      if (!saved) onSaved(after.id);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function play() {
    if (saved && JSON.stringify(saved.course) === JSON.stringify(lane)) return onPlay(saved.game, lane.name);
    const draft = `custom-lanedraft${++drafts}-1`;
    if (learnLane(draft, lane)) onPlay(draft, lane.name);
  }

  async function remove() {
    if (!saved || !window.confirm(`Delete “${lane.name}”? Tables already bowling on it carry on.`)) return;
    setBusy(true);
    try {
      await lanes.remove(saved.id);
      onLeave();
    } catch (e) {
      setProblem((e as Error).message);
      setBusy(false);
    }
  }

  if (loading) return <main className="setup golf-editor"><p className="fine">Finding the lane…</p></main>;

  return (
    <main className="setup golf-editor lane-editor">
      <header className="setup-head">
        <div className="suits" aria-hidden>🎳</div>
        <h1>Make a bowling lane</h1>
        <p>Put things on the lane between the foul line and the pins, then bowl a game on it against the computer. Share it and it's in everyone's Bowling.</p>
      </header>

      <TextField label="Lane name" required value={lane.name} maxlength={LANE_LIMITS.name} onValueChange={(e: CustomEvent<string>) => setLane((l) => ({ ...l, name: e.detail }))} />

      <div className="golf-work">
        <section className="golf-paint" aria-label="Paint the lane">
          <div className="golf-palette" role="radiogroup" aria-label="What to paint">
            {PALETTE.map(({ piece: p, glyph }) => (
              <button key={p} type="button" role="radio" aria-checked={piece === p} className={piece === p ? "picked" : ""} title={LANE_PIECES[p].hint} onClick={() => setPiece(p)}>
                <span className={`golf-swatch ${CLASS[p]}`}>{glyph}</span>
                {LANE_PIECES[p].name}
              </button>
            ))}
          </div>
          <p className="fine golf-hint">{LANE_PIECES[piece].hint}. Tap or drag across the squares.</p>
          <p className="fine lane-end">The pins ↑</p>
          <div
            ref={grid}
            className="golf-grid"
            style={{ "--cols": lane.cols, "--rows": lane.rows } as React.CSSProperties}
            onPointerDown={(e) => {
              const square = squareAt(e);
              if (!square) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              painting.current = square;
              remember();
              paint(square);
            }}
            onPointerMove={(e) => {
              const last = painting.current;
              const square = squareAt(e);
              if (!last || !square || (square[0] === last[0] && square[1] === last[1])) return;
              paint(square, last);
              painting.current = square;
            }}
            onPointerUp={() => (painting.current = null)}
            onPointerCancel={() => (painting.current = null)}
          >
            {[...lane.cells].map((p, i) => (
              <span key={i} className={`golf-square ${CLASS[p]}`} aria-hidden>
                {GLYPH[p]}
              </span>
            ))}
          </div>
          <p className="fine lane-end">The foul line, where the ball starts ↓</p>
          <div className="rule-actions">
            <button type="button" className="secondary" disabled={!canUndo} onClick={undo}>
              Undo
            </button>
            <button type="button" className="link" disabled={!lane.cells.replaceAll(".", "")} onClick={() => (remember(), setLane((l) => ({ ...l, cells: starterLane().cells })))}>
              Clear the lane
            </button>
          </div>
        </section>

        <section className="golf-look" aria-label="The lane, as it plays">
          <TablePreview
            table={table}
            label={`${lane.name} as the table draws it`}
            className="hole-preview lane-preview"
            replay={replay && test?.shown ? [test.shown] : null}
            onReplayEnd={() => setReplay(false)}
          />
          {open && (
            <div className={`golf-verdict${test ? ` rated-${test.rating.replace(" ", "-")}` : ""}`} aria-live="polite">
              {!test ? (
                <p>The computer is bowling at it…</p>
              ) : test.rating === "unplayable" ? (
                <p>
                  <strong>Can't be bowled.</strong> Even a perfect ball doesn't reach a pin.
                </p>
              ) : (
                <p>
                  <strong>{RATED[test.rating]}.</strong> Bowling like a decent player, the computer knocks down about {test.firstBall} pins with a first ball; its best ball knocks down {test.best}.
                </p>
              )}
              {test?.shown && (
                <button type="button" className="secondary" disabled={replay} onClick={() => setReplay(true)}>
                  {replay ? "Watching…" : "Watch a ball"}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="house-block golf-save" aria-label="Save">
        <label className="golf-share">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share it: everyone can pick it in Bowling
        </label>
        {problems === null ? <p className="fine">The computer is bowling at it…</p> : problems.length > 0 && <p className="fine">Before it can be bowled: {problems[0]}</p>}
        <div className="rule-actions">
          <button type="button" className="primary" disabled={busy || !ready || !lane.name.trim() || !unsaved} onClick={() => void save()}>
            {saved ? (unsaved ? "Save changes" : "Saved") : "Save the lane"}
          </button>
          <button type="button" className="secondary" disabled={!ready} onClick={play}>
            Bowl on it against the computer
          </button>
          {saved && (
            <button type="button" className="link danger" disabled={busy} onClick={() => void remove()}>
              Delete
            </button>
          )}
        </div>
        {note && <p className="fine">{note}</p>}
        {problem && <p className="error">{problem}</p>}
        {saved && <p className="fine">Changes are a new version: tables already bowling on this lane finish on the one they started with.</p>}
      </section>

      <button type="button" className="link" onClick={() => (!unsaved || window.confirm("Leave without saving?")) && onLeave()}>
        ← Bowling
      </button>
    </main>
  );
}
