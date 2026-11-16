// The setup screen for an arcade game: the rules, whether computer players join you, how the
// controls work, your best score, then Play. An arcade game is played against the game itself, so
// there is no table to open and nobody to name.
import { arcadeGame, points, type ArcadeGameId, type TableGame } from "@journey-to-code/games";
import SelectField from "@open-parlor/ui/zubra-ui/select-field.zb";
import { useEffect, useState } from "react";
import { KitRulesFields, KitRulesSheet } from "../kit/KitRules";
import { Choice, Toggle } from "../RulesEditor";
import { SetupLayout } from "../SetupLayout";
import { arcadeSays, arcadeTagline } from "./flavour";
import { loadArcadeBest, loadArcadeCrew, loadArcadeHouse, loadArcadeRules, loadAutofire, loadMyHouses, saveArcadeCrew, saveArcadeHouse, saveArcadeRules, saveAutofire, type ArcadeRules } from "../storage";
import { boardOf, fetchRuns, type HouseRun } from "./scores";

interface Props {
  game: ArcadeGameId;
  onHome: () => void;
  /** `rival` is a housemate's run to take on: the same seed, and their score to beat. */
  onPlay: (rules: ArcadeRules, seats: number, autofire: boolean, rival?: { name: string; score: number; seed: number }) => void;
  /** Open a table on the server for this many people (and computer players), to play the same game together. */
  onTogether?: (rules: ArcadeRules, seats: number) => Promise<void>;
}

export function ArcadeSetup({ game: id, onHome, onPlay, onTogether }: Props) {
  const game = arcadeGame(id)!;
  const [rules, setRules] = useState<ArcadeRules>(() => loadArcadeRules(id));
  const [crew, setCrew] = useState(() => loadArcadeCrew(id));
  const [autofire, setAutofire] = useState(loadAutofire);
  const [showRules, setShowRules] = useState(false);
  const [together, setTogether] = useState(2);
  const [opening, setOpening] = useState<string | null>(null);
  const houses = loadMyHouses();
  const [house, setHouse] = useState(loadArcadeHouse);
  const [runs, setRuns] = useState<HouseRun[]>([]);
  useEffect(() => {
    if (!house) return setRuns([]);
    let live = true;
    void fetchRuns(house.slug, id).then((r) => live && setRuns(r));
    return () => {
      live = false;
    };
  }, [house?.slug, id]);
  const start = (rival?: { name: string; score: number; seed: number }) => {
    saveArcadeRules(id, rules);
    saveArcadeCrew(id, crew);
    saveAutofire(autofire);
    onPlay(rules, crew, autofire, rival);
  };
  const presets: ArcadeRules[] = game.presets;
  const preset = presets.find((p) => p.id === rules.id && JSON.stringify(p) === JSON.stringify(rules));
  const errors: string[] = game.validate(rules);
  const best = loadArcadeBest(id, rules, crew);
  const board = runs.filter((run) => run.board === boardOf(id, rules, crew));
  // The rules sheet and editor only read a game's fields and its rules in words, which an arcade game has too.
  // They are worded the way the parlor words this game (see flavour.ts).
  const says = (text: string) => arcadeSays(id, text);
  const asTable = { ...game, fields: game.fields.map((f) => ({ ...f, label: says(f.label), ...(f.hint ? { hint: says(f.hint) } : {}) })), describe: (r: ArcadeRules) => game.describe(r).map(says) } as unknown as TableGame<any, any, any, any>;

  const crews: [string, string][] = [];
  for (let n = game.seats.min; n <= game.seats.max; n++) crews.push([String(n), n === 1 ? "On your own" : n === 2 ? "With a computer player" : `With ${n - 1} computer players`]);

  return (
    <SetupLayout
      solo
      emoji={game.emoji}
      title={game.name}
      tagline={arcadeTagline(id, game.tagline)}
      onHome={onHome}
      you={
        <>
          <SelectField
            label="Rules"
            value={preset ? preset.id : "custom"}
            options={[...presets.map((p) => ({ value: p.id, label: p.name })), ...(preset ? [] : [{ value: "custom", label: "Your own" }])]}
            onValueChange={(e: CustomEvent<string>) => {
              const next = presets.find((p) => p.id === e.detail);
              if (next) setRules(next);
            }}
          />
          {crews.length > 1 && <Choice label="Crew" value={crew} options={crews} onChange={(v) => setCrew(Number(v))} />}
          <p className="arcade-best-line">
            {best > 0 ? (
              <>
                Your best with these rules: <strong>{points(best)}</strong>
              </>
            ) : (
              "No score with these rules yet."
            )}
          </p>
          {houses.length > 0 && (
            <SelectField
              label="Scores go to"
              value={house?.slug ?? ""}
              options={[{ value: "", label: "This browser only" }, ...houses.map((h) => ({ value: h.slug, label: h.name }))]}
              onValueChange={(e: CustomEvent<string>) => {
                saveArcadeHouse(e.detail || null);
                setHouse(houses.find((h) => h.slug === e.detail) ?? null);
              }}
            />
          )}
          {house && (
            <section className="arcade-house" aria-label={`${house.name}'s best`}>
              <h3>{house.name}'s best with these rules</h3>
              {board.length === 0 ? (
                <p>Nobody has posted a run with these rules yet. Yours could be the first.</p>
              ) : (
                <ol>
                  {board.map((run) => (
                    <li key={run.name + run.at} className={run.me ? "mine" : ""}>
                      <b>{run.me ? `${run.name} (you)` : run.name}</b>
                      <span>
                        {points(run.score)} · {run.stage}
                      </span>
                      <button type="button" disabled={errors.length > 0} onClick={() => start({ name: run.me ? "your best" : run.name, score: run.score, seed: run.seed })}>
                        {run.me ? "Play that run again" : "Take it on"}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </>
      }
      actions={
        <>
          <button
            type="button"
            className="primary deal"
            disabled={errors.length > 0}
            onClick={() => start()}
          >
            Play
          </button>
          {errors.length > 0 && <p className="error">{errors.join(" ")}</p>}
          {onTogether && (
            <section className="arcade-together" aria-label="Play together">
              <h3>Play together</h3>
              <p>Open a table and send the link: everyone plays the same game, live, on the same side.</p>
              <Choice label="Seats" value={together} options={Array.from({ length: game.seats.max - 1 }, (_, i) => [String(i + 2), `${i + 2} players`] as [string, string])} onChange={(v) => setTogether(Number(v))} />
              <button
                type="button"
                className="secondary"
                disabled={errors.length > 0 || opening === ""}
                onClick={() => {
                  saveArcadeRules(id, rules);
                  setOpening("");
                  onTogether(rules, together).catch((e: Error) => setOpening(e.message || "The table could not be opened."));
                }}
              >
                {opening === "" ? "Opening a table…" : "Open a table"}
              </button>
              {opening && <p className="error">{opening}</p>}
            </section>
          )}
        </>
      }
      table={
        id === "skyfire" ? (
          <Toggle label="Guns fire by themselves" description="Off: hold Z or Space to fire. On a touch screen they always fire while your finger is down." checked={autofire} onChange={setAutofire} />
        ) : (
          <p className="fine">Sounds follow the switch at the bottom of the game's screen.</p>
        )
      }
      about={
        <>
          <KitRulesSheet game={asTable} rules={rules} />
          <button type="button" className="link" onClick={() => setShowRules((v) => !v)}>
            {showRules ? "Hide the rules" : "Change the rules"}
          </button>
          {showRules && (
            <section className="rules" aria-label="Rules">
              <KitRulesFields game={asTable} rules={rules} onChange={(patch) => setRules((r) => ({ ...r, ...patch, id: "custom", name: "Your own" }))} />
            </section>
          )}
          <h3 className="arcade-how">Controls</h3>
          <ul className="rules-lines">
            {game.controls.map((line) => (
              <li key={line}>{arcadeSays(id, line)}</li>
            ))}
          </ul>
        </>
      }
      more={<p className="fine">{house ? `A finished run is sent to ${house.name}, which plays it back to check the score. "Take it on" gives you the very same game a housemate had.` : "Scores are kept in this browser."}</p>}
    />
  );
}
