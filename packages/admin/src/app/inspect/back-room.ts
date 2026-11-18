// The Back Room's own rules, as the admin app plays them back: the very files the game is built from
// (packages/wasm/src/battler), so an inspected run is played by the code that made it, not by a copy.
export { decode, inspect, type Inspection, type RunRecord, type Step } from "../../../../wasm/src/battler/record";
export { DEFAULT_TABLES, tune, type Tables, type Tunables } from "../../../../wasm/src/battler/tables";
