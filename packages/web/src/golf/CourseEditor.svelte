<!--
  Make a Mini Golf course: paint each hole on a grid, a piece a square (green, a wall, sand, water,
  a slope, a bumper, the tee, the cup), see it as the table will draw it, play it against the
  computer, and save it: for yourself, or shared, in everyone's Mini Golf setup.

  Svelte, inside the React app (editors.tsx mounts it), on the parlor's Zubra components as plain
  elements.
-->
<script lang="ts" module>
  // Counted for the page, not for one editor: a course's game id is never handed out twice.
  let drafts = 0;
</script>

<script lang="ts">
  import type { SportShot } from "@journey-to-code/games";
  import { buildHole, courseProblems, holeProblems, LIMITS, PIECES, starterCourse, starterHole, suggestPar, TUNNELS, type CustomCourse, type CustomHole, type HoleTest, type Piece } from "@open-parlor/courses";
  // `?element`: the elements themselves. In this React app a .zb import from anywhere but a .vue
  // file is React's wrapper otherwise (zubra#377).
  import "@open-parlor/ui/zubra-ui/select-field.zb?element";
  import "@open-parlor/ui/zubra-ui/text-field.zb?element";
  import { untrack } from "svelte";
  import { loadName } from "../storage";
  import { courses, learnCourse, type SavedCourse } from "./coursesApi";
  import { playtests } from "./playtests.svelte";
  import { holeTable } from "./table";
  import TablePreview from "./TablePreview.svelte";

  let {
    id,
    onleave,
    onplay,
    onsaved,
  }: {
    /** The course to change, or "new". */
    id: string;
    onleave: () => void;
    /** Play this course against the computer: its game id (a draft one if it isn't saved), and how many holes. */
    onplay: (course: string, holes: number) => void;
    /** Saved for the first time: the page's address should say which course it is now. */
    onsaved: (id: string) => void;
  } = $props();

  /** How a playtest's verdict reads, and the mark on a hole's tab. */
  const RATED: Record<HoleTest["rating"], { word: string; mark: string }> = {
    easy: { word: "Easy", mark: "✓" },
    fair: { word: "Fair", mark: "✓" },
    hard: { word: "Hard", mark: "◆" },
    "very hard": { word: "Very hard", mark: "◆" },
    unplayable: { word: "Can't be played", mark: "!" },
  };
  const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

  /**
   * What can be painted. Most tools are one piece; the tunnel and the molehill are three pieces each
   * (tunnels 1 to 3), and paint the next one that's missing, so a mouth and its molehill pair up.
   */
  type Tool = Piece | "tunnel" | "molehill";
  /** The order pieces sit in the palette, and what a square of each looks like on the grid. */
  const PALETTE: { tool: Tool; glyph: string; name: string; hint: string; cls: string }[] = [
    ...(["g", "#", "s", "w", "^", "v", "<", ">", "o", "h"] as const).map((p) => ({ tool: p, glyph: ({ "^": "↑", v: "↓", "<": "←", ">": "→", o: "●", h: "▲" } as Record<string, string>)[p] ?? "", name: PIECES[p].name, hint: PIECES[p].hint, cls: "" })),
    { tool: "tunnel", glyph: "1", name: "Tunnel", hint: "A mole's hole: a ball that rolls in pops up at the molehill with the same number", cls: "mouth" },
    { tool: "molehill", glyph: "1", name: "Molehill", hint: "Where a ball that went down the tunnel with the same number comes up", cls: "molehill" },
    { tool: "t", glyph: "T", name: PIECES.t.name, hint: PIECES.t.hint, cls: "" },
    { tool: "c", glyph: "◉", name: PIECES.c.name, hint: PIECES.c.hint, cls: "" },
    { tool: ".", glyph: "", name: PIECES["."].name, hint: PIECES["."].hint, cls: "" },
  ];
  const TOOL = Object.fromEntries(PALETTE.map((p) => [p.tool, p])) as Record<Tool, (typeof PALETTE)[number]>;
  const GLYPH: Record<string, string> = { "^": "↑", v: "↓", "<": "←", ">": "→", o: "●", h: "▲", t: "T", c: "◉", "1": "1", "2": "2", "3": "3", x: "1", y: "2", z: "3" };
  /** A class name for each piece: what colour a square is. */
  const CLASS: Record<string, string> = { ".": "garden", g: "green", "#": "wall", s: "sand", w: "water", "^": "slope", v: "slope", "<": "slope", ">": "slope", o: "bumper", h: "high", t: "tee", c: "cup", "1": "mouth", "2": "mouth", "3": "mouth", x: "molehill", y: "molehill", z: "molehill" };
  /** Pieces there is only one of on a hole: painting one moves it. */
  const ONE_OF: string[] = ["t", "c", ...TUNNELS.flat()];

  /** The piece a tool paints on this hole: for a tunnel or a molehill, the next number that's missing one. Null: all three are down. */
  function pieceFor(tool: Tool, cells: string): Piece | null {
    if (tool === "tunnel") return (TUNNELS.find(([m]) => !cells.includes(m))?.[0] as Piece) ?? null;
    if (tool === "molehill") {
      const [, hill] = TUNNELS.find(([m, x]) => cells.includes(m) && !cells.includes(x)) ?? TUNNELS.find(([, x]) => !cells.includes(x)) ?? [];
      return (hill as Piece) ?? null;
    }
    return tool;
  }
  const HISTORY = 40;

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

  const range = ([min, max]: readonly [number, number]) => Array.from({ length: max - min + 1 }, (_, i) => ({ value: String(min + i), label: String(min + i) }));
  const COLS = range(LIMITS.cols);
  const ROWS = range(LIMITS.rows);
  const PARS = range(LIMITS.par);

  /** The grid at a new size, what was there kept where it was (from the top left). */
  function resized(h: CustomHole, cols: number, rows: number): CustomHole {
    let cells = "";
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells += r < h.rows && c < h.cols ? h.cells[r * h.cols + c]! : ".";
    return { ...h, cols, rows, cells };
  }

  // Whole values, replaced on each change (as the React editor did): holes are sent to a worker
  // and a course is compared as JSON, so they stay plain objects.
  const draft = untrack(() => loadDraft(id));
  let course = $state.raw<CustomCourse>(draft?.course ?? starterCourse());
  let saved = $state.raw<SavedCourse | null>(null);
  let shared = $state(draft?.shared ?? false);
  let at = $state(0);
  let tool = $state<Tool>("g");
  let problem = $state<string | null>(null);
  let note = $state<string | null>(null);
  let busy = $state(false);
  let loading = $state(untrack(() => id) !== "new");
  let history: CustomCourse[] = [];
  let canUndo = $state(false);
  /** The square a drag last painted: a fast drag fills in every square between two moves. */
  let painting: [number, number] | null = null;
  /** What this drag paints: chosen when it starts, so a drag with the tunnel moves one tunnel rather than laying three. */
  let dragging: Piece | null = null;
  let grid = $state<HTMLDivElement>();

  // A course of yours to change; someone else's, to start a copy from.
  $effect(() => {
    if (id === "new") return;
    const asked = id;
    let live = true;
    courses.get(asked).then(
      (c) => {
        if (!live) return;
        // Changes not saved yet, from before a practice game, win over what's on the server.
        const kept = loadDraft(asked);
        course = kept?.course ?? (c.mine ? c.course : { ...c.course, name: `${c.course.name} (copy)`.slice(0, LIMITS.name) });
        saved = c.mine ? c : null;
        shared = kept?.shared ?? (c.mine ? c.shared : false);
        if (!c.mine) note = `This is ${c.author}'s course: what you save is a copy of your own.`;
        loading = false;
      },
      (e: Error) => {
        if (!live) return;
        problem = e.message;
        loading = false;
      },
    );
    return () => {
      live = false;
    };
  });

  $effect(() => {
    if (!loading) saveDraft(saved?.id ?? id, course, shared);
  });

  const hole = $derived(course.holes[at] ?? course.holes[0]!);
  const problems = $derived(courseProblems(course));
  const holeIssues = $derived(holeProblems(hole));
  const built = $derived(holeIssues.length ? null : buildHole(hole, `preview-${at}`));
  const table = $derived(built ? holeTable(built) : null);
  // Each hole the grid allows is played by the computer, off the page's thread.
  const tests = playtests<HoleTest>("minigolf", () => course.holes.map((h) => (holeProblems(h).length ? null : h)));
  const test = $derived(holeIssues.length ? null : (tests.all[at] ?? null));
  let replay = $state.raw<SportShot[] | null>(null);
  const cells = $derived(hole.cells);
  $effect(() => {
    void cells;
    void at;
    replay = null;
  });
  const suggested = $derived(test && test.rating !== "unplayable" ? test.par : suggestPar(hole));
  const untested = $derived(course.holes.some((h, i) => !holeProblems(h).length && !tests.all[i]));
  const unplayable = $derived(course.holes.flatMap((h, i) => (tests.all[i]?.rating === "unplayable" ? [h.name] : [])));
  const unsaved = $derived(!saved || JSON.stringify(saved.course) !== JSON.stringify(course) || saved.shared !== shared);

  function remember() {
    history = [...history.slice(-(HISTORY - 1)), course];
    canUndo = true;
  }
  function undo() {
    const last = history.pop();
    if (last) course = last;
    canUndo = history.length > 0;
  }
  /**
   * Change the hole being painted. Its par follows the suggested one while the maker hasn't set a
   * par of their own (a par that is the suggestion for the hole as it was).
   */
  function changeHole(change: (h: CustomHole) => CustomHole) {
    course = {
      ...course,
      holes: course.holes.map((h, i) => {
        if (i !== at) return h;
        const next = change(h);
        return next.cells !== h.cells && next.par === h.par && h.par === suggestPar(h) ? { ...next, par: suggestPar(next) } : next;
      }),
    };
  }

  /** Paint the squares from one to another, every one on the line between. A tee or a cup moves: there is one of each. */
  function paint(to: [number, number], from: [number, number] = to, chosen?: Piece | null) {
    const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
    const line = Array.from({ length: steps + 1 }, (_, k) => [Math.round(from[0] + ((to[0] - from[0]) * k) / (steps || 1)), Math.round(from[1] + ((to[1] - from[1]) * k) / (steps || 1))] as const);
    changeHole((h) => {
      const piece = chosen === undefined ? pieceFor(tool, h.cells) : chosen;
      if (!piece) return h;
      // A tee, a cup, a tunnel or a molehill goes only where the drag ends.
      const squares = ONE_OF.includes(piece) ? [line.at(-1)!] : line;
      let next = h.cells;
      if (ONE_OF.includes(piece)) next = next.replaceAll(piece, "g");
      for (const [col, row] of squares) {
        const i = row * h.cols + col;
        next = next.slice(0, i) + piece + next.slice(i + 1);
      }
      return next === h.cells ? h : { ...h, cells: next };
    });
  }
  function squareAt(e: PointerEvent): [number, number] | null {
    const box = grid!.getBoundingClientRect();
    const col = Math.floor(((e.clientX - box.left) / box.width) * hole.cols);
    const row = Math.floor(((e.clientY - box.top) / box.height) * hole.rows);
    return col >= 0 && row >= 0 && col < hole.cols && row < hole.rows ? [col, row] : null;
  }

  function addHole() {
    if (course.holes.length >= LIMITS.holes[1]) return;
    remember();
    course = { ...course, holes: [...course.holes, starterHole(course.holes.length + 1)] };
    at = course.holes.length - 1;
  }
  function removeHole() {
    if (course.holes.length <= 1 || !window.confirm(`Remove ${hole.name}?`)) return;
    remember();
    const gone = at;
    course = { ...course, holes: course.holes.filter((_, i) => i !== gone) };
    at = Math.max(0, gone - 1);
  }
  function moveHole(by: -1 | 1) {
    const to = at + by;
    if (to < 0 || to >= course.holes.length) return;
    remember();
    const holes = [...course.holes];
    [holes[at], holes[to]] = [holes[to]!, holes[at]!];
    course = { ...course, holes };
    at = to;
  }

  async function save() {
    busy = true;
    problem = null;
    try {
      const was = saved;
      const after = was ? await courses.update(was.id, { course, shared }) : await courses.create(course, loadName() || "Someone", shared);
      saved = after;
      course = after.course;
      note = after.shared ? "Saved, and shared: everyone can pick it in Mini Golf now." : "Saved. Only you see it in Mini Golf; share it when it's ready.";
      if (!was) onsaved(after.id);
    } catch (e) {
      problem = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  function play() {
    // Saved and unchanged: the saved course. Otherwise a draft, on this page only.
    if (saved && JSON.stringify(saved.course) === JSON.stringify(course)) return onplay(saved.game, course.holes.length);
    const game = `custom-draft${++drafts}-1`;
    if (learnCourse(game, course)) onplay(game, course.holes.length);
  }

  async function remove() {
    if (!saved || !window.confirm(`Delete “${course.name}”? Tables already playing it carry on.`)) return;
    busy = true;
    try {
      await courses.remove(saved.id);
      onleave();
    } catch (e) {
      problem = (e as Error).message;
      busy = false;
    }
  }

  const resize = (cols: number, rows: number) => {
    remember();
    changeHole((h) => resized(h, cols, rows));
  };
</script>

{#if loading}
  <main class="setup golf-editor"><p class="fine">Finding the course…</p></main>
{:else}
  <main class="setup golf-editor">
    <header class="setup-head">
      <div class="suits" aria-hidden="true">⛳</div>
      <h1>Make a Mini Golf course</h1>
      <p>Paint each hole a square at a time, then play it against the computer. Share it and it's in everyone's Mini Golf.</p>
    </header>

    <text-field label="Course name" required={true} value={course.name} maxlength={LIMITS.name} onvaluechange={(e: CustomEvent<string>) => (course = { ...course, name: e.detail })}></text-field>

    <nav class="golf-holes" aria-label="Holes">
      {#each course.holes as h, i (i)}
        {@const rated = tests.all[i]}
        <button type="button" class={i === at ? "picked" : ""} aria-pressed={i === at} onclick={() => (at = i)}>
          {i + 1}
          {#if holeProblems(h).length}
            <span class="golf-flag" aria-label="needs work">!</span>
          {:else if rated}
            <span class="golf-rated rated-{rated.rating.replace(' ', '-')}" aria-label={RATED[rated.rating].word}>{RATED[rated.rating].mark}</span>
          {/if}
        </button>
      {/each}
      {#if course.holes.length < LIMITS.holes[1]}
        <button type="button" class="add" onclick={addHole}>+ Add a hole</button>
      {/if}
    </nav>

    <div class="golf-work">
      <section class="golf-paint" aria-label="Paint {hole.name}">
        <div class="golf-palette" role="radiogroup" aria-label="What to paint">
          {#each PALETTE as { tool: t, glyph, name, hint, cls } (t)}
            <button type="button" role="radio" aria-checked={tool === t} class={tool === t ? "picked" : ""} title={hint} onclick={() => (tool = t)}>
              <span class="golf-swatch {cls || CLASS[t]}">{glyph}</span>
              {name}
            </button>
          {/each}
        </div>
        <p class="fine golf-hint">
          {TOOL[tool].hint}.
          {tool === "tunnel" || tool === "molehill"
            ? pieceFor(tool, hole.cells)
              ? "Tap a square. Up to three tunnels a hole; painting over one takes it away."
              : `All three ${tool === "tunnel" ? "tunnels" : "molehills"} are down: paint over one to take it away.`
            : "Tap or drag across the squares."}
        </p>
        <!-- Painting is for a pointer: the squares are a picture, and the palette says what each is. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          bind:this={grid}
          class="golf-grid"
          style:--cols={hole.cols}
          style:--rows={hole.rows}
          onpointerdown={(e) => {
            const square = squareAt(e);
            if (!square) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            painting = square;
            dragging = pieceFor(tool, hole.cells);
            remember();
            paint(square, square, dragging);
          }}
          onpointermove={(e) => {
            const last = painting;
            const square = squareAt(e);
            if (!last || !square || (square[0] === last[0] && square[1] === last[1])) return;
            paint(square, last, dragging);
            painting = square;
          }}
          onpointerup={() => (painting = null)}
          onpointercancel={() => (painting = null)}
        >
          {#each hole.cells as p, i (i)}
            <span class="golf-square {CLASS[p]}" aria-hidden="true">{GLYPH[p] ?? ""}</span>
          {/each}
        </div>
        <div class="golf-size">
          <select-field label="Squares across" value={String(hole.cols)} options={COLS} onvaluechange={(e: CustomEvent<string>) => resize(Number(e.detail), hole.rows)}></select-field>
          <select-field label="Squares down" value={String(hole.rows)} options={ROWS} onvaluechange={(e: CustomEvent<string>) => resize(hole.cols, Number(e.detail))}></select-field>
        </div>
        <div class="rule-actions">
          <button type="button" class="secondary" disabled={!canUndo} onclick={undo}>Undo</button>
          <button type="button" class="link" disabled={at === 0} onclick={() => moveHole(-1)}>Move earlier</button>
          <button type="button" class="link" disabled={at === course.holes.length - 1} onclick={() => moveHole(1)}>Move later</button>
          {#if course.holes.length > 1}
            <button type="button" class="link danger" onclick={removeHole}>Remove this hole</button>
          {/if}
        </div>
      </section>

      <section class="golf-look" aria-label="{hole.name}, as it plays">
        {#if table}
          <TablePreview {table} label="{hole.name} as the table draws it" {replay} onreplayend={() => (replay = null)} />
          <div class="golf-verdict{test ? ` rated-${test.rating.replace(' ', '-')}` : ''}" aria-live="polite">
            {#if !test}
              <p>The computer is playing it…</p>
            {:else if test.rating === "unplayable"}
              <p>
                <strong>Can't be played.</strong>
                {test.possible
                  ? `Putting like a decent player, the computer never got it in within ${test.limit} strokes, in ${test.tries} tries: only perfect aim does it. Watch the perfect try, then give the ball an easier way to the cup.`
                  : "The computer couldn't get the ball in, even with perfect aim. Watch where it goes wrong, and open up the way to the cup."}
              </p>
            {:else}
              <p>
                <strong>{RATED[test.rating].word}.</strong> Putting like a decent player, the computer holed it {times(test.holed)} in {test.tries}{test.average !== null ? `, in about ${Math.round(test.average * 10) / 10} strokes` : ""}. It plays to par {test.par}.{test.shown.trouble.length > 0 ? ` On the try below it went ${[...new Set(test.shown.trouble)].join(" and ")}.` : ""}{test.rating === "very hard" ? " Most players won't get it in: worth making a little easier." : ""}
              </p>
            {/if}
            {#if test}
              {@const shown = test.shown.shots}
              <button type="button" class="secondary" disabled={!!replay} onclick={() => (replay = shown)}>
                {replay ? "Watching…" : test.rating === "unplayable" ? (test.possible ? "Watch the perfect try" : "Watch its best try") : "Watch the computer play it"}
              </button>
            {/if}
          </div>
        {:else}
          <div class="hole-preview golf-unplayable">
            {#each holeIssues as p (p)}
              <p>{p}</p>
            {/each}
          </div>
        {/if}
        <text-field label="Hole name" required={true} value={hole.name} maxlength={LIMITS.holeName} onvaluechange={(e: CustomEvent<string>) => changeHole((h) => ({ ...h, name: e.detail }))}></text-field>
        <div class="golf-par">
          <select-field label="Par" value={String(hole.par)} options={PARS} onvaluechange={(e: CustomEvent<string>) => changeHole((h) => ({ ...h, par: Number(e.detail) }))}></select-field>
          {#if suggested !== hole.par && !holeIssues.length && test?.rating !== "unplayable"}
            {@const par = suggested}
            <button type="button" class="link" onclick={() => changeHole((h) => ({ ...h, par }))}>Use {par} ({test ? "how it played" : "suggested"})</button>
          {/if}
        </div>
        <text-field label="A tip at the tee" value={hole.tip} maxlength={LIMITS.tip} onvaluechange={(e: CustomEvent<string>) => changeHole((h) => ({ ...h, tip: e.detail }))}></text-field>
      </section>
    </div>

    <section class="house-block golf-save" aria-label="Save">
      <label class="golf-share">
        <input type="checkbox" bind:checked={shared} />
        Share it: everyone can pick it in Mini Golf
      </label>
      {#if problems.length > 0}
        <p class="fine">Before it can be played: {problems[0]}</p>
      {:else if unplayable.length > 0}
        <p class="fine">Before it can be saved: players won't get the ball in on {unplayable.join(", ")}. Make {unplayable.length === 1 ? "it" : "them"} a little easier.</p>
      {:else if untested}
        <p class="fine">The computer is playing your holes…</p>
      {/if}
      <div class="rule-actions">
        <button type="button" class="primary" disabled={busy || problems.length > 0 || untested || unplayable.length > 0 || !course.name.trim() || !unsaved} onclick={() => void save()}>
          {saved ? (unsaved ? "Save changes" : "Saved") : "Save the course"}
        </button>
        <button type="button" class="secondary" disabled={problems.length > 0} onclick={play}>Play it against the computer</button>
        {#if saved}
          <button type="button" class="link danger" disabled={busy} onclick={() => void remove()}>Delete</button>
        {/if}
      </div>
      {#if note}<p class="fine">{note}</p>{/if}
      {#if problem}<p class="error">{problem}</p>{/if}
      {#if saved}<p class="fine">Changes are a new version: tables already playing this course finish on the holes they started with.</p>{/if}
    </section>

    <button type="button" class="link" onclick={() => (!unsaved || window.confirm("Leave without saving?")) && onleave()}>← Mini Golf</button>
  </main>
{/if}
