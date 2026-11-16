// A house's best runs at the arcade games. A member sends in a finished run as it was played (the
// rules, the seed, and every change of the controls) and the server plays it again itself: only the
// score that run really earns is kept. Each member's best is kept for each set of rules and crew,
// with its seed, so anybody in the house can take on the very same run.
import { arcadeGame, isArcadeGame, replay, type ArcadeGameId, type ArcadeLog } from "@journey-to-code/games";

interface Sync {
  write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown>;
  documents(): Promise<{ get(collection: string, key: string): Record<string, unknown> | undefined }>;
}
interface Member {
  id: string;
  name: string;
}
/** A run that was checked and kept. */
interface Run {
  member: string;
  score: number;
  /** The rules and crew it was played with, as one piece of text: runs are only compared within one. */
  board: string;
  rules: Record<string, unknown>;
  seats: number;
  seed: number;
  stage: string;
  ticks: number;
  at: number;
}

/** The longest run taken, in seconds of play, and the most a log may hold. */
const LONGEST = 3 * 60 * 60;
const MOST_CHANGES = 600_000;
/** The most runs kept for a house and game. */
const KEPT = 200;

export function createScores(sync: Sync) {
  const runsOf = async (house: string, game: ArcadeGameId): Promise<Run[]> => {
    const doc = (await sync.documents()).get("scores", `${house}/${game}`);
    return Array.isArray(doc?.runs) ? [...(doc!.runs as Run[])] : [];
  };
  const shown = (runs: Run[], house: { members: Member[] }, me: Member) =>
    runs
      .filter((r) => house.members.some((m) => m.id === r.member))
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .map((r) => ({ name: house.members.find((m) => m.id === r.member)!.name, me: r.member === me.id, score: r.score, board: r.board, rules: r.rules, seats: r.seats, seed: r.seed, stage: r.stage, ticks: r.ticks, at: r.at }));

  return {
    /**
     * /houses/:slug/scores, for a member of the house.
     *   GET  ?game=                                     → { game, runs }: each member's best for each set of rules, best first
     *   POST { game, rules, seats, seed, log, score }    → { kept, best, runs }, or 400 when the run does not earn that score
     */
    async handle(house: { slug: string; members: Member[] }, me: Member, method: string, input: Record<string, unknown>, query: URLSearchParams, now = Date.now()): Promise<{ status: number; body: unknown }> {
      const asked = method === "POST" ? input.game : query.get("game");
      if (!isArcadeGame(asked)) return { status: 400, body: { error: "That is not an arcade game." } };
      const game = arcadeGame(asked)!;
      const runs = await runsOf(house.slug, asked);
      if (method === "GET") return { status: 200, body: { game: asked, runs: shown(runs, house, me) } };

      const seats = input.seats;
      const seed = input.seed;
      const log = input.log as ArcadeLog<unknown> | undefined;
      const sound =
        typeof seats === "number" && Number.isInteger(seats) && seats >= game.seats.min && seats <= game.seats.max &&
        typeof seed === "number" && Number.isSafeInteger(seed) && seed >= 0 &&
        typeof input.score === "number" && Number.isSafeInteger(input.score) && input.score >= 0 &&
        !!log && typeof log === "object" && Array.isArray(log.changes) && log.changes.length <= MOST_CHANGES && typeof log.ticks === "number";
      if (!sound) return { status: 400, body: { error: "That is not a run." } };
      const rules = game.normalize(input.rules) as Record<string, unknown>;
      if (game.validate(rules as never).length) return { status: 400, body: { error: "Those are not rules this game can be played by." } };
      // Play it again, here. A run that is not over, or does not earn what it claims, is not kept.
      let state: unknown;
      try {
        state = replay(game, rules, seats as number, seed as number, log!, LONGEST * game.rate);
      } catch {
        return { status: 400, body: { error: "That run can't be played back." } };
      }
      const view = game.view(state as never);
      const summary = game.summary(state as never);
      if (!view.over) return { status: 400, body: { error: "That run is not over." } };
      if (summary.score !== input.score) return { status: 400, body: { error: "That run does not earn that score." } };

      const board = `${seats}:${JSON.stringify(rules)}`;
      const mine = runs.find((r) => r.member === me.id && r.board === board);
      const kept = !mine || summary.score > mine.score;
      if (kept) {
        const run: Run = { member: me.id, score: summary.score, board, rules, seats: seats as number, seed: seed as number, stage: view.stage, ticks: summary.ticks, at: now };
        const next = [...runs.filter((r) => r !== mine), run].sort((a, b) => b.at - a.at).slice(0, KEPT);
        await sync.write("scores", `${house.slug}/${asked}`, { runs: next, deleted: false });
        return { status: 200, body: { kept, best: summary.score, runs: shown(next, house, me) } };
      }
      return { status: 200, body: { kept, best: mine!.score, runs: shown(runs, house, me) } };
    },
  };
}
