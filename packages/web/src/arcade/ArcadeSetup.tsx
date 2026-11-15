// The setup screen for an arcade game: the rules, whether computer players join you, how the
// controls work, your best score, then Play. An arcade game is played against the game itself, so
// there is no table to open and nobody to name.
import { arcadeGame, points, type ArcadeGameId, type TableGame } from "@journey-to-code/games";
import SelectField from "@open-parlor/ui/zubra-ui/select-field.zb";
import { useState } from "react";
import { KitRulesFields, KitRulesSheet } from "../kit/KitRules";
import { Choice, Toggle } from "../RulesEditor";
import { SetupLayout } from "../SetupLayout";
import { loadArcadeBest, loadArcadeCrew, loadArcadeRules, loadAutofire, saveArcadeCrew, saveArcadeRules, saveAutofire, type ArcadeRules } from "../storage";

interface Props {
  game: ArcadeGameId;
  onHome: () => void;
  onPlay: (rules: ArcadeRules, seats: number, autofire: boolean) => void;
}

export function ArcadeSetup({ game: id, onHome, onPlay }: Props) {
  const game = arcadeGame(id)!;
  const [rules, setRules] = useState<ArcadeRules>(() => loadArcadeRules(id));
  const [crew, setCrew] = useState(() => loadArcadeCrew(id));
  const [autofire, setAutofire] = useState(loadAutofire);
  const [showRules, setShowRules] = useState(false);
  const presets: ArcadeRules[] = game.presets;
  const preset = presets.find((p) => p.id === rules.id && JSON.stringify(p) === JSON.stringify(rules));
  const errors: string[] = game.validate(rules);
  const best = loadArcadeBest(id, rules, crew);
  // The rules sheet and editor only read a game's fields and its rules in words, which an arcade game has too.
  const asTable = game as unknown as TableGame<any, any, any, any>;

  const crews: [string, string][] = [];
  for (let n = game.seats.min; n <= game.seats.max; n++) crews.push([String(n), n === 1 ? "On your own" : n === 2 ? "With a computer player" : `With ${n - 1} computer players`]);

  return (
    <SetupLayout
      solo
      emoji={game.emoji}
      title={game.name}
      tagline={game.tagline}
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
        </>
      }
      actions={
        <>
          <button
            type="button"
            className="primary deal"
            disabled={errors.length > 0}
            onClick={() => {
              saveArcadeRules(id, rules);
              saveArcadeCrew(id, crew);
              saveAutofire(autofire);
              onPlay(rules, crew, autofire);
            }}
          >
            Play
          </button>
          {errors.length > 0 && <p className="error">{errors.join(" ")}</p>}
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
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      }
      more={<p className="fine">Scores are kept in this browser.</p>}
    />
  );
}
