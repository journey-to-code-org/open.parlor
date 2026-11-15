// A brain for the bot pool's tests (see botpool.ts): a "game" whose think takes as long as the job
// says, by spinning, the way a search that has lost track of the time would.
export function think(job) {
  if (job.boom) throw new Error("the engine fell over");
  // A real job from the parlor (it has a game's state) never comes back at all.
  const until = performance.now() + (job.spin ?? (job.state ? 600_000 : 0));
  while (performance.now() < until);
  return job.none ? null : { played: job.n ?? 0, by: "think" };
}

export function warm() {
  const until = performance.now() + 20;
  while (performance.now() < until);
}
