// Make a Mini Golf course: paint each hole on a grid, a piece a square (green, a wall, sand, water,
// a slope, a bumper, the tee, the cup), see it as the table will draw it, play it against the
// computer, and save it: for yourself, or shared, in everyone's Mini Golf setup.
import { buildHole, courseProblems, holeProblems, LIMITS, PIECES, starterCourse, starterHole, suggestPar, type CustomCourse, type CustomHole, type Piece } from "@open-parlor/courses";
import SelectField from "@open-parlor/ui/zubra-ui/select-field.zb";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadName } from "../storage";
import { courses, learnCourse, type SavedCourse } from "./coursesApi";
import { HolePreview } from "./HolePreview";

/** The order pieces sit in the palette, and what a square of each looks like on the grid. */
const PALETTE: { piece: Piece; glyph: string }[] = [
  { piece: "g", glyph: "" },
  { piece: "#", glyph: "" },
  { piece: "s", glyph: "" },
  { piece: "w", glyph: "" },
  { piece: "^", glyph: "↑" },
  { piece: "v", glyph: "↓" },
  { piece: "<", glyph: "←" },
  { piece: ">", glyph: "→" },
  { piece: "o", glyph: "●" },
  { piece: "t", glyph: "T" },
  { piece: "c", glyph: "◉" },
  { piece: ".", glyph: "" },
];
const GLYPH = Object.fromEntries(PALETTE.map((p) => [p.piece, p.glyph])) as Record<string, string>;
/** A class name for each piece: what colour a square is. */
const CLASS: Record<string, string> = { ".": "garden", g: "green", "#": "wall", s: "sand", w: "water", "^": "slope", v: "slope", "<": "slope", ">": "slope", o: "bumper", t: "tee", c: "cup" };
const ONE_OF: Piece[] = ["t", "c"];
const HISTORY = 40;
let drafts = 0;

/** The course being made, kept for this tab: it survives a practice game and coming back. */
const DRAFT = "open-parlor:golf-draft";
function loadDraft(id: string): { course: CustomCourse; shared: boolean } | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT) ?? "null") as { id: string; course: CustomCourse; shared: boolean } | null;
    return d && d.id === id && Array.isArray(d.course?.holes) && d.course.holes.length ? d : null;
  } catch {
    return null;
  }
}
function saveDraft(id: string, course: CustomCourse, shared: boolean) {
  try {
    sessionStorage.setItem(DRAFT, JSON.stringify({ id, course, shared }));
  } catch {}
}

const range = ([min, max]: readonly [number, number]) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

/** The grid at a new size, what was there kept where it was (from the top left). */
function resized(h: CustomHole, cols: number, rows: number): CustomHole {
  let cells = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells += r < h.rows && c < h.cols ? h.cells[r * h.cols + c]! : ".";
  return { ...h, cols, rows, cells };
}

export function CourseEditor({
  id,
  onLeave,
  onPlay,
  onSaved,
}: {
  /** The course to change, or "new". */
  id: string;
  onLeave: () => void;
  /** Play this course against the computer: its game id (a draft one if it isn't saved). */
  onPlay: (course: string, holes: number) => void;
  /** Saved for the first time: the page's address should say which course it is now. */
  onSaved: (id: string) => void;
}) {
  const draft = loadDraft(id);
  const [course, setCourse] = useState<CustomCourse>(() => draft?.course ?? starterCourse());
  const [saved, setSaved] = useState<SavedCourse | null>(null);
  const [shared, setShared] = useState(draft?.shared ?? false);
  const [at, setAt] = useState(0);
  const [piece, setPiece] = useState<Piece>("g");
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(id !== "new");
  const history = useRef<CustomCourse[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  /** The square a drag last painted: a fast drag fills in every square between two moves. */
  const painting = useRef<[number, number] | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  // A course of yours to change; someone else's, to start a copy from.
  useEffect(() => {
    if (id === "new") return;
    let live = true;
    courses.get(id).then(
      (c) => {
        if (!live) return;
        // Changes not saved yet, from before a practice game, win over what's on the server.
        const kept = loadDraft(id);
        setCourse(kept?.course ?? (c.mine ? c.course : { ...c.course, name: `${c.course.name} (copy)`.slice(0, LIMITS.name) }));
        setSaved(c.mine ? c : null);
        setShared(kept?.shared ?? (c.mine ? c.shared : false));
        if (!c.mine) setNote(`This is ${c.author}'s course: what you save is a copy of your own.`);
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
    if (!loading) saveDraft(saved?.id ?? id, course, shared);
  }, [course, shared, saved, id, loading]);

  const hole = course.holes[at] ?? course.holes[0]!;
  const problems = useMemo(() => courseProblems(course), [course]);
  const holeIssues = useMemo(() => holeProblems(hole), [hole]);
  const built = useMemo(() => (holeIssues.length ? null : buildHole(hole, `preview-${at}`)), [hole, holeIssues, at]);
  const suggested = useMemo(() => suggestPar(hole), [hole]);
  const unsaved = !saved || JSON.stringify(saved.course) !== JSON.stringify(course) || saved.shared !== shared;

  function remember() {
    history.current = [...history.current.slice(-(HISTORY - 1)), course];
    setCanUndo(true);
  }
  function undo() {
    const last = history.current.pop();
    if (last) setCourse(last);
    setCanUndo(history.current.length > 0);
  }
  /**
   * Change the hole being painted. Its par follows the suggested one while the maker hasn't set a
   * par of their own (a par that is the suggestion for the hole as it was).
   */
  const changeHole = (change: (h: CustomHole) => CustomHole) =>
    setCourse((c) => ({
      ...c,
      holes: c.holes.map((h, i) => {
        if (i !== at) return h;
        const next = change(h);
        return next.cells !== h.cells && next.par === h.par && h.par === suggestPar(h) ? { ...next, par: suggestPar(next) } : next;
      }),
    }));

  /** Paint the squares from one to another, every one on the line between. A tee or a cup moves: there is one of each. */
  function paint(to: [number, number], from: [number, number] = to) {
    const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
    const line = Array.from({ length: steps + 1 }, (_, k) => [Math.round(from[0] + ((to[0] - from[0]) * k) / (steps || 1)), Math.round(from[1] + ((to[1] - from[1]) * k) / (steps || 1))] as const);
    // A tee or a cup goes only where the drag ends.
    const squares = ONE_OF.includes(piece) ? [line.at(-1)!] : line;
    changeHole((h) => {
      let cells = h.cells;
      if (ONE_OF.includes(piece)) cells = cells.replaceAll(piece, "g");
      for (const [col, row] of squares) {
        const i = row * h.cols + col;
        cells = cells.slice(0, i) + piece + cells.slice(i + 1);
      }
      return cells === h.cells ? h : { ...h, cells };
    });
  }
  function squareAt(e: React.PointerEvent): [number, number] | null {
    const box = grid.current?.getBoundingClientRect();
    if (!box) return null;
    const col = Math.floor(((e.clientX - box.left) / box.width) * hole.cols);
    const row = Math.floor(((e.clientY - box.top) / box.height) * hole.rows);
    return col >= 0 && row >= 0 && col < hole.cols && row < hole.rows ? [col, row] : null;
  }

  function addHole() {
    if (course.holes.length >= LIMITS.holes[1]) return;
    remember();
    setCourse((c) => ({ ...c, holes: [...c.holes, starterHole(c.holes.length + 1)] }));
    setAt(course.holes.length);
  }
  function removeHole() {
    if (course.holes.length <= 1 || !window.confirm(`Remove ${hole.name}?`)) return;
    remember();
    setCourse((c) => ({ ...c, holes: c.holes.filter((_, i) => i !== at) }));
    setAt((n) => Math.max(0, n - 1));
  }
  function moveHole(by: -1 | 1) {
    const to = at + by;
    if (to < 0 || to >= course.holes.length) return;
    remember();
    setCourse((c) => {
      const holes = [...c.holes];
      [holes[at], holes[to]] = [holes[to]!, holes[at]!];
      return { ...c, holes };
    });
    setAt(to);
  }

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      const after = saved ? await courses.update(saved.id, { course, shared }) : await courses.create(course, loadName() || "Someone", shared);
      setSaved(after);
      setCourse(after.course);
      setNote(after.shared ? "Saved, and shared: everyone can pick it in Mini Golf now." : "Saved. Only you see it in Mini Golf; share it when it's ready.");
      if (!saved) onSaved(after.id);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function play() {
    // Saved and unchanged: the saved course. Otherwise a draft, on this page only.
    if (saved && JSON.stringify(saved.course) === JSON.stringify(course)) return onPlay(saved.game, course.holes.length);
    const draft = `custom-draft${++drafts}-1`;
    if (learnCourse(draft, course)) onPlay(draft, course.holes.length);
  }

  async function remove() {
    if (!saved || !window.confirm(`Delete “${course.name}”? Tables already playing it carry on.`)) return;
    setBusy(true);
    try {
      await courses.remove(saved.id);
      onLeave();
    } catch (e) {
      setProblem((e as Error).message);
      setBusy(false);
    }
  }

  if (loading) return <main className="setup golf-editor"><p className="fine">Finding the course…</p></main>;

  return (
    <main className="setup golf-editor">
      <header className="setup-head">
        <div className="suits" aria-hidden>⛳</div>
        <h1>Make a Mini Golf course</h1>
        <p>Paint each hole a square at a time, then play it against the computer. Share it and it's in everyone's Mini Golf.</p>
      </header>

      <TextField label="Course name" required value={course.name} maxlength={LIMITS.name} onValueChange={(e: CustomEvent<string>) => setCourse((c) => ({ ...c, name: e.detail }))} />

      <nav className="golf-holes" aria-label="Holes">
        {course.holes.map((h, i) => (
          <button key={i} type="button" className={i === at ? "picked" : ""} aria-pressed={i === at} onClick={() => setAt(i)}>
            {i + 1}
            {holeProblems(h).length ? <span className="golf-flag" aria-label="needs work">!</span> : null}
          </button>
        ))}
        {course.holes.length < LIMITS.holes[1] && (
          <button type="button" className="add" onClick={addHole}>
            + Add a hole
          </button>
        )}
      </nav>

      <div className="golf-work">
        <section className="golf-paint" aria-label={`Paint ${hole.name}`}>
          <div className="golf-palette" role="radiogroup" aria-label="What to paint">
            {PALETTE.map(({ piece: p, glyph }) => (
              <button key={p} type="button" role="radio" aria-checked={piece === p} className={piece === p ? "picked" : ""} title={PIECES[p].hint} onClick={() => setPiece(p)}>
                <span className={`golf-swatch ${CLASS[p]}`}>{glyph}</span>
                {PIECES[p].name}
              </button>
            ))}
          </div>
          <p className="fine golf-hint">{PIECES[piece].hint}. Tap or drag across the squares.</p>
          <div
            ref={grid}
            className="golf-grid"
            style={{ "--cols": hole.cols, "--rows": hole.rows } as React.CSSProperties}
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
            {[...hole.cells].map((p, i) => (
              <span key={i} className={`golf-square ${CLASS[p]}`} aria-hidden>
                {GLYPH[p]}
              </span>
            ))}
          </div>
          <div className="golf-size">
            <SelectField label="Squares across" value={String(hole.cols)} options={range(LIMITS.cols).map((n) => ({ value: String(n), label: String(n) }))} onValueChange={(e: CustomEvent<string>) => (remember(), changeHole((h) => resized(h, Number(e.detail), h.rows)))} />
            <SelectField label="Squares down" value={String(hole.rows)} options={range(LIMITS.rows).map((n) => ({ value: String(n), label: String(n) }))} onValueChange={(e: CustomEvent<string>) => (remember(), changeHole((h) => resized(h, h.cols, Number(e.detail))))} />
          </div>
          <div className="rule-actions">
            <button type="button" className="secondary" disabled={!canUndo} onClick={undo}>
              Undo
            </button>
            <button type="button" className="link" disabled={at === 0} onClick={() => moveHole(-1)}>
              Move earlier
            </button>
            <button type="button" className="link" disabled={at === course.holes.length - 1} onClick={() => moveHole(1)}>
              Move later
            </button>
            {course.holes.length > 1 && (
              <button type="button" className="link danger" onClick={removeHole}>
                Remove this hole
              </button>
            )}
          </div>
        </section>

        <section className="golf-look" aria-label={`${hole.name}, as it plays`}>
          {built ? (
            <HolePreview hole={built} label={`${hole.name} as the table draws it`} />
          ) : (
            <div className="hole-preview golf-unplayable">
              {holeIssues.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          )}
          <TextField label="Hole name" required value={hole.name} maxlength={LIMITS.holeName} onValueChange={(e: CustomEvent<string>) => changeHole((h) => ({ ...h, name: e.detail }))} />
          <div className="golf-par">
            <SelectField label="Par" value={String(hole.par)} options={range(LIMITS.par).map((n) => ({ value: String(n), label: String(n) }))} onValueChange={(e: CustomEvent<string>) => changeHole((h) => ({ ...h, par: Number(e.detail) }))} />
            {suggested !== hole.par && !holeIssues.length && (
              <button type="button" className="link" onClick={() => changeHole((h) => ({ ...h, par: suggested }))}>
                Use {suggested} (suggested)
              </button>
            )}
          </div>
          <TextField label="A tip at the tee" value={hole.tip} maxlength={LIMITS.tip} onValueChange={(e: CustomEvent<string>) => changeHole((h) => ({ ...h, tip: e.detail }))} />
        </section>
      </div>

      <section className="house-block golf-save" aria-label="Save">
        <label className="golf-share">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share it: everyone can pick it in Mini Golf
        </label>
        {problems.length > 0 && <p className="fine">Before it can be played: {problems[0]}</p>}
        <div className="rule-actions">
          <button type="button" className="primary" disabled={busy || problems.length > 0 || !course.name.trim() || !unsaved} onClick={() => void save()}>
            {saved ? (unsaved ? "Save changes" : "Saved") : "Save the course"}
          </button>
          <button type="button" className="secondary" disabled={problems.length > 0} onClick={play}>
            Play it against the computer
          </button>
          {saved && (
            <button type="button" className="link danger" disabled={busy} onClick={() => void remove()}>
              Delete
            </button>
          )}
        </div>
        {note && <p className="fine">{note}</p>}
        {problem && <p className="error">{problem}</p>}
        {saved && <p className="fine">Changes are a new version: tables already playing this course finish on the holes they started with.</p>}
      </section>

      <button type="button" className="link" onClick={() => (!unsaved || window.confirm("Leave without saving?")) && onLeave()}>
        ← Mini Golf
      </button>
    </main>
  );
}
