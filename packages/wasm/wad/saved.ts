// The changes someone has made in the editor, kept in the browser (IndexedDB) so the game can be
// played with them and the editor can pick up where it left off.
import { store } from "../host/store.ts";
import { type Kind, KINDS, key } from "./catalogue.ts";
import type { Change } from "./mod.ts";

/** Each change is a file: "sprite/TROOA1". */
const kept = store("shooter-mod");

export async function loadMod(): Promise<Change[]> {
  const changes: Change[] = [];
  for (const [path, data] of await kept.load()) {
    const [kind, name] = path.split("/") as [Kind, string];
    if (KINDS.includes(kind) && name) changes.push({ kind, name, data });
  }
  return changes;
}

export const saveChange = (change: Change) => kept.save(key(change.kind, change.name), change.data);
export const removeChange = (kind: Kind, name: string) => kept.remove(key(kind, name));
