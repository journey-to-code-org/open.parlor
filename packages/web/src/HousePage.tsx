// A family's own corner. React keeps what's shared with table setup (the game picker, the rules
// editors, starting a table) and the house's settings; the lists are Vue islands of the parlor's
// parts (house/*.vue): the invite, the tables, the tournaments, the family and the standings.
import { validatePalaceRules, type PalaceRules } from "@journey-to-code/palace";
import { validatePreset, type RulePreset } from "@journey-to-code/rules";
import { isKitGame } from "@journey-to-code/games";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import { useCallback, useEffect, useState } from "react";
import { GamePicker } from "./GamePicker";
import { HouseAiBlock } from "./HouseAi";
import { HouseChatBlock } from "./HouseChat";
import { HouseError, houses, type House } from "./housesApi";
import HouseFamily from "./house/HouseFamily.vue";
import HouseTables from "./house/HouseTables.vue";
import HouseTournaments from "./house/HouseTournaments.vue";
import Invited from "./house/Invited.vue";
import Leaderboard from "./house/Leaderboard.vue";
import PlacesLeaderboard from "./house/PlacesLeaderboard.vue";
import { KitHouseRules, KitStartTable } from "./kit/KitHouse";
import { PalaceRulesFields, palaceSummary } from "./palace/PalaceRules";
import { Choice, describe, RulesFields } from "./RulesEditor";
import { forgetHouse, loadGame, loadTableSettings, loadPalaceSeats, rememberHouse, saveGame, savePalaceSeats, type GameId } from "./storage";
import { HouseDeckPicker } from "./TableDeck";
import { NewTournament } from "./TournamentPage";
import { VueIsland } from "./vue/island";

interface Props {
  slug: string;
  /** The invite code, when the page was opened from an invite link. */
  code: string | null;
  onOpenTable: (id: string) => void;
  onOpenTournament: (id: string) => void;
  onLeave: () => void;
}

type State =
  | { kind: "loading" }
  | { kind: "invited"; name: string }
  | { kind: "member"; house: House }
  | { kind: "closed"; message: string };

/** A family's own corner: their tables, their people, their rules. */
export function HousePage({ slug, code, onOpenTable, onOpenTournament, onLeave }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [problem, setProblem] = useState<string | null>(null);

  const show = useCallback((house: House) => {
    rememberHouse({ slug: house.slug, name: house.name });
    setState({ kind: "member", house });
  }, []);

  const load = useCallback(async () => {
    try {
      const found = await houses.get(slug, code);
      if ("member" in found) setState({ kind: "invited", name: found.name });
      else show(found);
    } catch (e) {
      if (e instanceof HouseError && e.status === 404) forgetHouse(slug);
      setState({ kind: "closed", message: e instanceof Error ? e.message : String(e) });
    }
  }, [slug, code, show]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the tables fresh while the page is open.
  useEffect(() => {
    if (state.kind !== "member") return;
    const tick = setInterval(() => document.visibilityState === "visible" && void load(), 8000);
    return () => clearInterval(tick);
  }, [state.kind, load]);

  const attempt = async (work: () => Promise<House | void>) => {
    setProblem(null);
    try {
      const house = await work();
      if (house) show(house);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  if (state.kind === "loading") return <main className="setup house"><p>Opening the house…</p></main>;

  if (state.kind === "closed") {
    return (
      <main className="setup house">
        <h1>Can't open this house</h1>
        <p>{state.message}</p>
        <button type="button" className="primary" onClick={onLeave}>
          Back
        </button>
      </main>
    );
  }

  if (state.kind === "invited") return <VueIsland component={Invited} props={{ houseName: state.name, problem, onJoin: (name: string) => void attempt(() => houses.join(slug, code!, name)) }} />;

  const { house } = state;
  return <MemberView house={house} attempt={attempt} problem={problem} onOpenTable={onOpenTable} onOpenTournament={onOpenTournament} onLeave={onLeave} />;
}

function MemberView(props: {
  house: House;
  attempt: (work: () => Promise<House | void>) => Promise<void>;
  problem: string | null;
  onOpenTable: (id: string) => void;
  onOpenTournament: (id: string) => void;
  onLeave: () => void;
}) {
  const { house, attempt } = props;
  const [makingTournament, setMakingTournament] = useState(false);
  const canManage = house.me.role === "owner" || house.me.role === "admin";
  const [presetId, setPresetId] = useState(house.defaultPreset);
  // Follow the house default when it changes, or when the chosen rules are deleted.
  useEffect(() => setPresetId(house.defaultPreset), [house.defaultPreset]);
  useEffect(() => {
    if (!house.presets.some((p) => p.id === presetId)) setPresetId(house.defaultPreset);
  }, [house.presets, presetId, house.defaultPreset]);
  const [editing, setEditing] = useState<RulePreset | null>(null);
  const [editingPalace, setEditingPalace] = useState<PalaceRules | null>(null);
  const [game, setGame] = useState<GameId>(loadGame);
  const [palaceId, setPalaceId] = useState(house.palaceDefault);
  const [seats, setSeats] = useState(loadPalaceSeats);
  useEffect(() => setPalaceId(house.palaceDefault), [house.palaceDefault]);
  const palaceRules = house.palacePresets.find((p) => p.id === palaceId) ?? house.palacePresets[0]!;
  const defaultRules = house.presets.find((p) => p.id === house.defaultPreset);



  return (
    <main className="setup house">
      <header className="setup-head">
        <div className="suits" aria-hidden>
          ♠ ♥ ♣ ♦
        </div>
        <h1>{house.name}</h1>
        <p>Welcome back, {house.me.name}.</p>
      </header>
      <GamePicker
        game={game}
        onPick={(g) => {
          saveGame(g);
          setGame(g);
        }}
      />

      {isKitGame(game) ? (
        <KitStartTable house={house} game={game} attempt={attempt} onOpenTable={props.onOpenTable} />
      ) : game === "palace" ? (
        <section className="house-block" aria-label="Start a table">
          {house.palacePresets.length > 1 && (
            <label className="field-inline">
              <span>Rules</span>
              <select value={palaceId} onChange={(e) => setPalaceId(e.target.value)}>
                {house.palacePresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.id === house.palaceDefault ? " (house default)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Choice label="Players" value={seats} options={[2, 3, 4, 5, 6].map((n) => [String(n), `${n} players`])} onChange={(v) => setSeats(Number(v))} />
          <button
            type="button"
            className="primary deal"
            onClick={() =>
              attempt(async () => {
                savePalaceSeats(seats);
                props.onOpenTable((await houses.openTable(house.slug, palaceRules.id, "palace", seats, loadTableSettings())).id);
              })
            }
          >
            Start a Palace table
          </button>
          <p className="rules-summary">{palaceSummary(palaceRules)}</p>
        </section>
      ) : (
      <section className="house-block" aria-label="Start a table">
        {house.presets.length > 1 && (
          <label className="field-inline">
            <span>Rules</span>
            <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {house.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === house.defaultPreset ? " (house default)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="primary deal" onClick={() => attempt(async () => props.onOpenTable((await houses.openTable(house.slug, presetId, "spades", undefined, loadTableSettings())).id))}>
          Start a table
        </button>
        <p className="rules-summary">{describe(house.presets.find((p) => p.id === presetId) ?? defaultRules ?? house.presets[0]!)}</p>
      </section>
      )}

      <VueIsland component={HouseTables} props={{ tables: house.tables, onOpenTable: props.onOpenTable }} />

      <HouseChatBlock slug={house.slug} members={house.members} me={house.me.id} manager={canManage} />

      <VueIsland component={HouseTournaments} props={{ tournaments: house.tournaments, canManage, game, onOpenTournament: props.onOpenTournament, onStart: () => setMakingTournament(true) }} />

      {game === "spades" ? (
        <VueIsland key="spades" component={Leaderboard} props={{ slug: house.slug, me: house.me.id, finished: finishedOf(house, "spades") }} />
      ) : (
        <VueIsland key="places" component={PlacesLeaderboard} props={{ slug: house.slug, me: house.me.id, game, finished: finishedOf(house, game) }} />
      )}

      <VueIsland component={HouseFamily} props={{ house, canManage, attempt }} />

      <HouseDeckPicker deck={house.deck ?? null} canChoose={canManage} save={(design) => houses.setDeck(house.slug, design).then((h) => attempt(async () => h))} />

      <HouseAiBlock house={house} onChange={(h) => void attempt(async () => h)} />

      {isKitGame(game) && <KitHouseRules house={house} game={game} attempt={attempt} canManage={canManage} />}

      {game === "palace" && (
        <section className="house-block" aria-label="Palace house rules">
          <h2>Palace house rules</h2>
          <ul className="house-list">
            {house.palacePresets.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>
                    {p.name}
                    {p.id === house.palaceDefault && <em> house default</em>}
                  </strong>
                  <small>{palaceSummary(p)}</small>
                </div>
                {canManage && (
                  <button type="button" className="link" onClick={() => setEditingPalace(structuredClone(p))}>
                    Edit
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canManage && (
            <button type="button" className="link" onClick={() => setEditingPalace({ ...structuredClone(palaceRules), id: "", name: "New rules" })}>
              Add another set of rules
            </button>
          )}
        </section>
      )}

      {game === "spades" && (
      <section className="house-block" aria-label="House rules">
        <h2>House rules</h2>
        <ul className="house-list">
          {house.presets.map((p) => (
            <li key={p.id}>
              <div>
                <strong>
                  {p.name}
                  {p.id === house.defaultPreset && <em> house default</em>}
                </strong>
                <small>{describe(p)}</small>
              </div>
              {canManage && (
                <button type="button" className="link" onClick={() => setEditing(structuredClone(p))}>
                  Edit
                </button>
              )}
            </li>
          ))}
        </ul>
        {canManage && (
          <button type="button" className="link" onClick={() => setEditing({ ...structuredClone(defaultRules ?? house.presets[0]!), id: "", name: "New rules" })}>
            Add another set of rules
          </button>
        )}
        {!canManage && <p className="fine">Ask {house.members.find((m) => m.role === "owner")?.name ?? "the owner"} to change the house rules.</p>}
      </section>
      )}

      {props.problem && <p className="error">{props.problem}</p>}
      <button type="button" className="link" onClick={props.onLeave}>
        Back to the start
      </button>

      {makingTournament && (
        <NewTournament
          house={house}
          game={game}
          presetId={isKitGame(game) ? (house.kitRules[game]?.default ?? "") : game === "palace" ? palaceId : presetId}
          settings={loadTableSettings()}
          onClose={() => setMakingTournament(false)}
          onMade={(id) => {
            setMakingTournament(false);
            props.onOpenTournament(id);
          }}
        />
      )}
      {editingPalace && (
        <PalaceRulesEditor
          rules={editingPalace}
          isDefault={editingPalace.id === house.palaceDefault}
          canDelete={!!editingPalace.id && house.palacePresets.length > 1}
          onClose={() => setEditingPalace(null)}
          onSave={(rules, makeDefault) =>
            attempt(async () => {
              const { id, ...rest } = rules;
              const saved = await houses.savePalace(house.slug, (id ? rules : rest) as PalaceRules, makeDefault);
              setEditingPalace(null);
              return saved;
            })
          }
          onDelete={() =>
            attempt(async () => {
              const saved = await houses.deletePalace(house.slug, editingPalace.id);
              setEditingPalace(null);
              return saved;
            })
          }
        />
      )}
      {editing && (
        <RulesSheet
          rules={editing}
          isDefault={editing.id === house.defaultPreset}
          canDelete={!!editing.id && house.presets.length > 1}
          onClose={() => setEditing(null)}
          onSave={(rules, makeDefault) =>
            attempt(async () => {
              const saved = await houses.savePreset(house.slug, rules, makeDefault);
              setEditing(null);
              return saved;
            })
          }
          onDelete={() =>
            attempt(async () => {
              const saved = await houses.deletePreset(house.slug, editing.id);
              setEditing(null);
              return saved;
            })
          }
        />
      )}
    </main>
  );
}

function RulesSheet(props: {
  rules: RulePreset;
  isDefault: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (rules: RulePreset, makeDefault: boolean) => void;
  onDelete: () => void;
}) {
  const [rules, setRules] = useState(props.rules);
  const [makeDefault, setMakeDefault] = useState(props.isDefault);
  const errors = validatePreset(rules);
  return (
    <div className="rules-sheet" role="dialog" aria-label="Edit house rules">
      <div className="rules-sheet-body setup">
        <TextField label="Name of these rules" value={rules.name} maxlength={30} onValueChange={(e: CustomEvent<string>) => setRules((r) => ({ ...r, name: e.detail }))} />
        <section className="rules">
          <RulesFields rules={rules} onChange={(patch) => setRules((r) => ({ ...r, ...patch }))} />
        </section>
        {!props.isDefault && (
          <label className="check">
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Make these the house default
          </label>
        )}
        {errors.length > 0 && <p className="error">{errors.join(" ")}</p>}
        <button type="button" className="primary" disabled={errors.length > 0} onClick={() => props.onSave(rules, makeDefault)}>
          Save
        </button>
        <div className="rule-actions">
          <button type="button" className="link" onClick={props.onClose}>
            Cancel
          </button>
          {props.canDelete && (
            <button type="button" className="link danger" onClick={() => confirm(`Delete "${rules.name}"?`) && props.onDelete()}>
              Delete these rules
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PalaceRulesEditor(props: {
  rules: PalaceRules;
  isDefault: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (rules: PalaceRules, makeDefault: boolean) => void;
  onDelete: () => void;
}) {
  const [rules, setRules] = useState(props.rules);
  const [makeDefault, setMakeDefault] = useState(props.isDefault);
  const errors = validatePalaceRules(rules);
  return (
    <div className="rules-sheet" role="dialog" aria-label="Edit Palace house rules">
      <div className="rules-sheet-body setup">
        <TextField label="Name of these rules" value={rules.name} maxlength={30} onValueChange={(e: CustomEvent<string>) => setRules((r) => ({ ...r, name: e.detail }))} />
        <section className="rules">
          <PalaceRulesFields rules={rules} onChange={(patch) => setRules((r) => ({ ...r, ...patch }))} />
        </section>
        {!props.isDefault && (
          <label className="check">
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Make these the house default
          </label>
        )}
        {errors.length > 0 && <p className="error">{errors.join(" ")}</p>}
        <button type="button" className="primary" disabled={errors.length > 0} onClick={() => props.onSave(rules, makeDefault)}>
          Save
        </button>
        <div className="rule-actions">
          <button type="button" className="link" onClick={props.onClose}>
            Cancel
          </button>
          {props.canDelete && (
            <button type="button" className="link danger" onClick={() => confirm(`Delete "${rules.name}"?`) && props.onDelete()}>
              Delete these rules
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** How many of a game's tables have finished: the standings are fetched again when it changes. */
function finishedOf(house: House, game: GameId): number {
  if (game === "spades") return house.tables.filter((t) => t.game !== "palace" && t.summary?.phase === "finished").length;
  return house.tables.filter((t) => t.game === game && (t.summary?.phase === "finished" || (t.summary as { over?: boolean } | null)?.over)).length;
}
