// A hole as a table holds it, with a ball on the tee: what the course editor's preview draws.
import { holeWorld, type GolfHole, type SportBody, type SportView } from "@journey-to-code/games";

export const TEE_BALL: SportBody = { id: "ball-0", owner: 0, kind: "ball", tone: "white", label: "a ball on the tee" };

export function holeTable(hole: GolfHole): SportView["table"] {
  return {
    key: hole.id,
    name: hole.name,
    world: holeWorld(hole, [{ id: TEE_BALL.id, x: hole.tee[0], y: hole.tee[1] }]),
    look: hole.look,
    bodies: [...hole.fixtures, TEE_BALL],
    ghosts: [],
  };
}
