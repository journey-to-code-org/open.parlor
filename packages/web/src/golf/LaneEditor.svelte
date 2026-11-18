<!--
  Make a bowling lane: paint the lane between the foul line and the pins, a piece a square (a crate,
  sand, water, a slope, a toadstool bumper), see it as the table draws it, bowl a game on it against
  the computer, and save it, for yourself or shared. Shared lanes are in everyone's Lane list in
  Bowling's setup. Kept on the server with the Mini Golf courses (see server/src/courses.ts).

  Svelte, inside the React app (editors.tsx mounts it), on the parlor's Zubra components as plain
  elements.
-->
<script lang="ts" module>
  // Counted for the page, not for one editor: a lane's game id is never handed out twice.
  let previews = 0;
  let drafts = 0;
</script>

<script lang="ts">
  import { bowling, LANES, newBowling, tenFrames, type SportView } from "@journey-to-code/games";
  import { buildLane, LANE_LIMITS, LANE_PIECES, starterLane, type CustomLane, type LanePiece, type LaneTest } from "@open-parlor/courses";
  // `?element`: the element itself. In this React app a .zb import from anywhere but a .vue file is
  // React's wrapper otherwise (zubra#377).
  import "@open-parlor/ui/zubra-ui/text-field.zb?element";
  import { untrack } from "svelte";
  import { loadName } from "../storage";
  import { learnLane, lanes, type SavedLane } from "./coursesApi";
  import { playtests } from "./playtests.svelte";
  import TablePreview from "./TablePreview.svelte";

  let {
    id,
    onleave,
    onplay,
    onsaved,
  }: {
    /** The lane to change, or "new". */
    id: string;
    onleave: () => void;
    /** Bowl on this lane against the computer: its game id (a draft one if it isn't saved), and its name. */
    onplay: (lane: string, name: string) => void;
    /** Saved for the first time: the page's address should say which lane it is now. */
    onsaved: (id: string) => void;
  } = $props();

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

  // Whole values, replaced on each change (as the React editor did): a lane is sent to a worker
  // and compared as JSON, so it stays a plain object.
  const draft = untrack(() => loadDraft(id));
  let lane = $state.raw<CustomLane>(draft?.lane ?? starterLane());
  let saved = $state.raw<SavedLane | null>(null);
  let shared = $state(draft?.shared ?? false);
  let piece = $state<LanePiece>("#");
  let problem = $state<string | null>(null);
  let note = $state<string | null>(null);
  let busy = $state(false);
  let loading = $state(untrack(() => id) !== "new");
  let replay = $state(false);
  let history: CustomLane[] = [];
  let canUndo = $state(false);
  let painting: [number, number] | null = null;
  let grid = $state<HTMLDivElement>();

  // A lane of yours to change; someone else's, to start a copy from.
  $effect(() => {
    if (id === "new") return;
    const asked = id;
    let live = true;
    lanes.get(asked).then(
      (l) => {
        if (!live) return;
        const kept = loadDraft(asked);
        lane = kept?.lane ?? (l.mine ? l.course : { ...l.course, name: `${l.course.name} (copy)`.slice(0, LANE_LIMITS.name) });
        saved = l.mine ? l : null;
        shared = kept?.shared ?? (l.mine ? l.shared : false);
        if (!l.mine) note = `This is ${l.author}'s lane: what you save is a copy of your own.`;
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
    if (!loading) saveDraft(saved?.id ?? id, lane, shared);
  });

  // The computer bowls at it, off the page's thread, once painting stops for a moment.
  const open = $derived(lane.cells.includes("."));
  const tests = playtests<LaneTest>("bowling", () => [open ? lane : null]);
  const test = $derived(tests.all[0] ?? null);
  const cells = $derived(lane.cells);
  $effect(() => {
    void cells;
    replay = false;
  });
  const problems: string[] | null = $derived(!open ? ["Leave some open lane for the ball to roll on."] : !test ? null : test.rating === "unplayable" ? ["No ball from the foul line gets to the pins. Leave a way through, or something that turns the ball towards them."] : []);

  // Drawn again when the squares change, not the name.
  const table = $derived.by(() => {
    void cells;
    return untrack(() => previewOf(lane));
  });
  const unsaved = $derived(!saved || JSON.stringify(saved.course) !== JSON.stringify(lane) || saved.shared !== shared);
  const ready = $derived(problems !== null && problems.length === 0);

  function remember() {
    history = [...history.slice(-(HISTORY - 1)), lane];
    canUndo = true;
  }
  function undo() {
    const last = history.pop();
    if (last) lane = last;
    canUndo = history.length > 0;
  }
  function paint(to: [number, number], from: [number, number] = to) {
    const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
    let next = lane.cells;
    for (let k = 0; k <= steps; k++) {
      const col = Math.round(from[0] + ((to[0] - from[0]) * k) / (steps || 1));
      const row = Math.round(from[1] + ((to[1] - from[1]) * k) / (steps || 1));
      const i = row * lane.cols + col;
      next = next.slice(0, i) + piece + next.slice(i + 1);
    }
    if (next !== lane.cells) lane = { ...lane, cells: next };
  }
  function squareAt(e: PointerEvent): [number, number] | null {
    const box = grid!.getBoundingClientRect();
    const col = Math.floor(((e.clientX - box.left) / box.width) * lane.cols);
    const row = Math.floor(((e.clientY - box.top) / box.height) * lane.rows);
    return col >= 0 && row >= 0 && col < lane.cols && row < lane.rows ? [col, row] : null;
  }

  async function save() {
    busy = true;
    problem = null;
    try {
      const was = saved;
      const after = was ? await lanes.update(was.id, { course: lane, shared }) : await lanes.create(lane, loadName() || "Someone", shared);
      saved = after;
      lane = after.course;
      note = after.shared ? "Saved, and shared: everyone can pick it in Bowling now." : "Saved. Only you see it in Bowling; share it when it's ready.";
      if (!was) onsaved(after.id);
    } catch (e) {
      problem = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  function play() {
    if (saved && JSON.stringify(saved.course) === JSON.stringify(lane)) return onplay(saved.game, lane.name);
    const game = `custom-lanedraft${++drafts}-1`;
    if (learnLane(game, lane)) onplay(game, lane.name);
  }

  async function remove() {
    if (!saved || !window.confirm(`Delete “${lane.name}”? Tables already bowling on it carry on.`)) return;
    busy = true;
    try {
      await lanes.remove(saved.id);
      onleave();
    } catch (e) {
      problem = (e as Error).message;
      busy = false;
    }
  }
</script>

{#if loading}
  <main class="setup golf-editor"><p class="fine">Finding the lane…</p></main>
{:else}
  <main class="setup golf-editor lane-editor">
    <header class="setup-head">
      <div class="suits" aria-hidden="true">🎳</div>
      <h1>Make a bowling lane</h1>
      <p>Put things on the lane between the foul line and the pins, then bowl a game on it against the computer. Share it and it's in everyone's Bowling.</p>
    </header>

    <text-field label="Lane name" required={true} value={lane.name} maxlength={LANE_LIMITS.name} onvaluechange={(e: CustomEvent<string>) => (lane = { ...lane, name: e.detail })}></text-field>

    <div class="golf-work">
      <section class="golf-paint" aria-label="Paint the lane">
        <div class="golf-palette" role="radiogroup" aria-label="What to paint">
          {#each PALETTE as { piece: p, glyph } (p)}
            <button type="button" role="radio" aria-checked={piece === p} class={piece === p ? "picked" : ""} title={LANE_PIECES[p].hint} onclick={() => (piece = p)}>
              <span class="golf-swatch {CLASS[p]}">{glyph}</span>
              {LANE_PIECES[p].name}
            </button>
          {/each}
        </div>
        <p class="fine golf-hint">{LANE_PIECES[piece].hint}. Tap or drag across the squares.</p>
        <p class="fine lane-end">The pins ↑</p>
        <!-- Painting is for a pointer: the squares are a picture, and the palette says what each is. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          bind:this={grid}
          class="golf-grid"
          style:--cols={lane.cols}
          style:--rows={lane.rows}
          onpointerdown={(e) => {
            const square = squareAt(e);
            if (!square) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            painting = square;
            remember();
            paint(square);
          }}
          onpointermove={(e) => {
            const last = painting;
            const square = squareAt(e);
            if (!last || !square || (square[0] === last[0] && square[1] === last[1])) return;
            paint(square, last);
            painting = square;
          }}
          onpointerup={() => (painting = null)}
          onpointercancel={() => (painting = null)}
        >
          {#each lane.cells as p, i (i)}
            <span class="golf-square {CLASS[p]}" aria-hidden="true">{GLYPH[p]}</span>
          {/each}
        </div>
        <p class="fine lane-end">The foul line, where the ball starts ↓</p>
        <div class="rule-actions">
          <button type="button" class="secondary" disabled={!canUndo} onclick={undo}>Undo</button>
          <button
            type="button"
            class="link"
            disabled={!lane.cells.replaceAll(".", "")}
            onclick={() => {
              remember();
              lane = { ...lane, cells: starterLane().cells };
            }}>Clear the lane</button
          >
        </div>
      </section>

      <section class="golf-look" aria-label="The lane, as it plays">
        <TablePreview
          {table}
          label="{lane.name} as the table draws it"
          class="hole-preview lane-preview"
          replay={replay && test?.shown ? [test.shown] : null}
          onreplayend={() => (replay = false)}
        />
        {#if open}
          <div class="golf-verdict{test ? ` rated-${test.rating.replace(' ', '-')}` : ''}" aria-live="polite">
            {#if !test}
              <p>The computer is bowling at it…</p>
            {:else if test.rating === "unplayable"}
              <p><strong>Can't be bowled.</strong> Even a perfect ball doesn't reach a pin.</p>
            {:else}
              <p>
                <strong>{RATED[test.rating]}.</strong> Bowling like a decent player, the computer knocks down about {test.firstBall} pins with a first ball; its best ball knocks down {test.best}.
              </p>
            {/if}
            {#if test?.shown}
              <button type="button" class="secondary" disabled={replay} onclick={() => (replay = true)}>{replay ? "Watching…" : "Watch a ball"}</button>
            {/if}
          </div>
        {/if}
      </section>
    </div>

    <section class="house-block golf-save" aria-label="Save">
      <label class="golf-share">
        <input type="checkbox" bind:checked={shared} />
        Share it: everyone can pick it in Bowling
      </label>
      {#if problems === null}
        <p class="fine">The computer is bowling at it…</p>
      {:else if problems.length > 0}
        <p class="fine">Before it can be bowled: {problems[0]}</p>
      {/if}
      <div class="rule-actions">
        <button type="button" class="primary" disabled={busy || !ready || !lane.name.trim() || !unsaved} onclick={() => void save()}>
          {saved ? (unsaved ? "Save changes" : "Saved") : "Save the lane"}
        </button>
        <button type="button" class="secondary" disabled={!ready} onclick={play}>Bowl on it against the computer</button>
        {#if saved}
          <button type="button" class="link danger" disabled={busy} onclick={() => void remove()}>Delete</button>
        {/if}
      </div>
      {#if note}<p class="fine">{note}</p>{/if}
      {#if problem}<p class="error">{problem}</p>{/if}
      {#if saved}<p class="fine">Changes are a new version: tables already bowling on this lane finish on the one they started with.</p>{/if}
    </section>

    <button type="button" class="link" onclick={() => (!unsaved || window.confirm("Leave without saving?")) && onleave()}>← Bowling</button>
  </main>
{/if}
