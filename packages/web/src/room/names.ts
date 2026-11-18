/** A seat written as {2} in the game's words, as that player's name. */
export const roomNamed = (text: string, names: readonly string[]) => text.replace(/\{(\d+)\}/g, (_, seat) => names[Number(seat)] ?? `Player ${Number(seat) + 1}`);
