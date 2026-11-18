// What a wall or a room can be made to do, by the engine's numbers, for someone choosing one.
// These are the ones levels are mostly made of, not all the engine knows: a level that uses
// another keeps it, and it is shown by its number.

export interface Does {
  number: number;
  name: string;
  /** Whether it acts on the rooms that share its tag, and so needs one. A door that is pushed acts on the room behind it. */
  tagged: boolean;
}

/** What a wall does when it is pushed, walked over or shot. */
export const WALL_DOES: Does[] = [
  { number: 0, name: "Nothing", tagged: false },
  { number: 1, name: "A door: push it, it opens, then closes", tagged: false },
  { number: 31, name: "A door: push it, it opens and stays open", tagged: false },
  { number: 26, name: "A door that needs the blue key", tagged: false },
  { number: 27, name: "A door that needs the yellow key", tagged: false },
  { number: 28, name: "A door that needs the red key", tagged: false },
  { number: 11, name: "A switch that ends the level", tagged: false },
  { number: 52, name: "Walk over it to end the level", tagged: false },
  { number: 51, name: "A switch that ends the level, to the secret one", tagged: false },
  { number: 124, name: "Walk over it to end the level, to the secret one", tagged: false },
  { number: 48, name: "Its picture slides sideways", tagged: false },
  { number: 63, name: "A switch: opens a door, which then closes", tagged: true },
  { number: 103, name: "A switch, once: opens a door for good", tagged: true },
  { number: 61, name: "A switch: opens a door for good", tagged: true },
  { number: 90, name: "Walk over it: a door opens, then closes", tagged: true },
  { number: 2, name: "Walk over it, once: a door opens for good", tagged: true },
  { number: 46, name: "Shoot it: a door opens for good", tagged: true },
  { number: 62, name: "A switch: a lift comes down, waits, goes up", tagged: true },
  { number: 88, name: "Walk over it: a lift comes down, waits, goes up", tagged: true },
  { number: 18, name: "A switch, once: a floor rises to the next one up", tagged: true },
  { number: 23, name: "A switch, once: a floor sinks to the lowest next to it", tagged: true },
  { number: 38, name: "Walk over it, once: a floor sinks to the lowest next to it", tagged: true },
  { number: 5, name: "Walk over it, once: a floor rises to the ceiling", tagged: true },
  { number: 7, name: "A switch, once: stairs rise", tagged: true },
  { number: 8, name: "Walk over it, once: stairs rise", tagged: true },
  { number: 97, name: "Walk over it: you are sent to the room's teleport landing", tagged: true },
  { number: 39, name: "Walk over it, once: you are sent to the room's teleport landing", tagged: true },
  { number: 35, name: "Walk over it, once: the lights go out", tagged: true },
];

/** What a room does to whoever is in it. */
export const ROOM_DOES: Does[] = [
  { number: 0, name: "Nothing", tagged: false },
  { number: 9, name: "Counts as a secret found", tagged: false },
  { number: 7, name: "Hurts a little (slime)", tagged: false },
  { number: 5, name: "Hurts (slime)", tagged: false },
  { number: 16, name: "Hurts a lot (slime)", tagged: false },
  { number: 4, name: "Hurts a lot, and the light blinks", tagged: false },
  { number: 11, name: "Hurts a lot, and ends the level when you are nearly dead", tagged: false },
  { number: 1, name: "The light flickers", tagged: false },
  { number: 17, name: "The light flickers like fire", tagged: false },
  { number: 8, name: "The light glows and dims", tagged: false },
  { number: 2, name: "The light blinks twice a second", tagged: false },
  { number: 3, name: "The light blinks once a second", tagged: false },
  { number: 10, name: "A door that closes after half a minute", tagged: false },
  { number: 14, name: "A door that opens after five minutes", tagged: false },
];

/** The choices, with one more for a number that isn't among them. */
export const choices = (all: Does[], now: number) => [...all.map((one) => ({ value: String(one.number), label: one.name })), ...(all.some((one) => one.number === now) ? [] : [{ value: String(now), label: `Something else (number ${now})` }])];
