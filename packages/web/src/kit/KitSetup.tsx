// The setup screen for any kit game: your name, house rules, how many players, then a family table
// or practice against the computer. A game with nothing hidden (sameDevice.ts) can also seat
// several people at this device.
import { kitGame, type KitGameId } from "@journey-to-code/games";
import SelectField from "@open-parlor/ui/zubra-ui/select-field.zb";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import { useMemo, useState } from "react";
import { ChallengeLink } from "../ChallengeLink";
import { lobbyProblem } from "../lobbyApi";
import { Choice, SameRulesToggle } from "../RulesEditor";
import { SetupLayout } from "../SetupLayout";
import { OFFLINE_LINE, useOnline } from "../offline";
import {
  deleteKitPreset,
  loadKitRules,
  loadKitSeats,
  loadMyHouses,
  loadName,
  loadOthersHere,
  loadPeopleHere,
  loadSavedKit,
  saveKitPreset,
  saveKitRules,
  saveKitSeats,
  saveName,
  saveOthersHere,
  savePeopleHere,
  type GameId,
} from "../storage";
import { OpponentSettings } from "../TableSettings";
import { KitRulesFields, KitRulesSheet } from "./KitRules";
import { CoursePicker, onCourse } from "../golf/CoursePicker";
import { LanePicker, onLane } from "../golf/LanePicker";
import { personName, sharesDevice } from "./sameDevice";
import { categoryOf } from "../categories";
import { loadRecord, recordLine } from "../record";

type Rules = { id: string; name: string } & Record<string, unknown>;

interface Props {
  game: KitGameId;
  /** Back to the open.parlor's front page, with every game. */
  onHome: () => void;
  /** `others`: the other people playing at this device, when there are any (see sameDevice.ts). */
  onPractice: (name: string, rules: Rules, seats: number, others?: string[]) => void;
  /** Host a table on this wifi, with no server (wifi/WifiHost.tsx). Not offered where it's left out (the blog embed). */
  onWifi?: (name: string, rules: Rules, seats: number) => void;
  onFamilyTable: (rules: Rules, seats: number) => Promise<void>;
  /** Sit at an open table that's waiting for this game, or open one with these rules and wait. */
  onFindPlayers: (name: string, rules: Rules, seats: number) => Promise<void>;
  onOpenHouse: (slug: string) => void;
  /** Mini Golf: open the course editor, at a course or "new". */
  onEditCourse?: (id: string) => void;
  /** Bowling: open the lane editor, at a lane or "new". */
  onEditLane?: (id: string) => void;
}

export function KitSetup({
  game: id,
  onHome,
  onPractice, onWifi,
  onFamilyTable,
  onFindPlayers,
  onOpenHouse,
  onEditCourse,
  onEditLane,
}: Props) {
  const game = kitGame(id)!;
  // A solitaire: no name to give, nobody to find, no computer players to tune. Rules, then Deal.
  const solo = game.seats.max === 1;
  const [name, setName] = useState(loadName);
  const [rules, setRules] = useState<Rules>(() => loadKitRules(id));
  const [seats, setSeats] = useState(() => loadKitSeats(id));
  // Several people at this device, for a game that can be shared on one screen.
  const shared = sharesDevice(id);
  const [peopleHere, setPeopleHere] = useState(() => (shared ? loadPeopleHere(id) : 1));
  const [others, setOthers] = useState(loadOthersHere);
  const tableSeats = game.teams ? 4 : seats;
  const people = Math.min(peopleHere, tableSeats);
  const [saved, setSaved] = useState(() => loadSavedKit(id));
  const [showRules, setShowRules] = useState(false);
  const record = useMemo(() => loadRecord(id), [id]);
  const [busy, setBusy] = useState(false);
  const online = useOnline();
  const [problem, setProblem] = useState<string | null>(null);
  const myHouses = loadMyHouses();
  const all: Rules[] = useMemo(() => [...game.presets, ...saved], [saved, id]);
  const options = all.some((p) => p.id === rules.id) ? all : [rules, ...all];
  const errors: string[] = game.validate(rules);
  const isSaved = saved.some((p) => p.id === rules.id);
  const remember = () => {
    saveName(name);
    saveKitRules(id, rules);
    saveKitSeats(id, seats);
    if (shared) {
      savePeopleHere(id, people);
      if (people > 1) saveOthersHere(others);
    }
  };

  function saveAs() {
    const label = window.prompt(
      "Name these rules",
      game.presets.some((p: Rules) => p.id === rules.id)
        ? `${name.trim() || "My"}'s ${game.name}`
        : rules.name,
    );
    if (!label?.trim()) return;
    const next = {
      ...rules,
      id:
        isSaved && label.trim() === rules.name
          ? rules.id
          : `${id}-${Date.now()}`,
      name: label.trim().slice(0, 30),
    };
    saveKitPreset(id, next);
    setSaved(loadSavedKit(id));
    setRules(next);
  }

  const seatChoices: [string, string][] = [];
  for (let n = game.seats.min; n <= game.seats.max; n++)
    seatChoices.push([String(n), `${n} players`]);

  const houses =
    myHouses.length > 0 ? (
      <section className="house-block" aria-label="Your houses">
        <h2>Your houses</h2>
        <ul className="house-list">
          {myHouses.map((h) => (
            <li key={h.slug}>
              <strong>{h.name}</strong>
              <button
                type="button"
                className="primary small"
                onClick={() => onOpenHouse(h.slug)}
              >
                Go in
              </button>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <SetupLayout
      emoji={game.emoji}
      title={game.name}
      tagline={game.tagline}
      onHome={onHome}
      houses={solo ? null : houses}
      solo={solo}
      you={
        <>
          {!solo && (
            <TextField
              label="Your name"
              value={name}
              maxlength={20}
              autocomplete="nickname"
              onValueChange={(e: CustomEvent<string>) => setName(e.detail)}
            />
          )}
          <SelectField
            label="House rules"
            value={rules.id}
            options={options.map((p) => ({ value: p.id, label: p.name }))}
            onValueChange={(e: CustomEvent<string>) => {
              const next = all.find((p) => p.id === e.detail);
              // Mini Golf's course and Bowling's lane are picked on their own: other rules don't change them.
              if (next) setRules(id === "minigolf" ? onCourse(next, String(rules.course ?? next.course)) : id === "bowling" ? onLane(next, String(rules.lane ?? "plain")) : next);
            }}
          />
          {id === "minigolf" && onEditCourse && <CoursePicker rules={rules} onChange={setRules} onEdit={onEditCourse} />}
          {id === "bowling" && onEditLane && <LanePicker rules={rules} onChange={setRules} onEdit={onEditLane} />}
          {game.teams ? (
            <p className="fine">
              Four players: you and your partner across the table against the
              other two.
            </p>
          ) : (
            seatChoices.length > 1 && (
              <Choice
                label="Players"
                value={seats}
                options={seatChoices}
                onChange={(v) => setSeats(Number(v))}
              />
            )
          )}
          {shared && (
            <>
              <Choice
                label="On this device"
                value={people}
                options={Array.from({ length: tableSeats }, (_, i) => [
                  String(i + 1),
                  i === 0 ? "Just me, against the computer" : i + 1 === tableSeats ? `${i + 1} of us, taking turns` : `${i + 1} of us, and ${tableSeats - i - 1} computer player${tableSeats - i - 1 === 1 ? "" : "s"}`,
                ])}
                onChange={(v) => setPeopleHere(Number(v))}
              />
              {Array.from({ length: people - 1 }, (_, i) => (
                <TextField
                  key={i}
                  label={`Player ${i + 2}'s name`}
                  value={others[i] ?? ""}
                  maxlength={20}
                  onValueChange={(e: CustomEvent<string>) => setOthers((names) => Array.from({ length: Math.max(names.length, i + 1) }, (_, j) => (j === i ? e.detail : (names[j] ?? ""))))}
                />
              ))}
              {people > 1 && <p className="fine">No connection needed: the screen turns to whoever's move it is.</p>}
            </>
          )}
        </>
      }
      table={<OpponentSettings solo={solo} cards={categoryOf(id) === "cards"} />}
      about={
        <>
          <KitRulesSheet game={game} rules={rules} />
          <button
            type="button"
            className="link"
            onClick={() => setShowRules((v) => !v)}
          >
            {showRules ? "Hide the rules" : "Change the rules"}
          </button>
          {showRules && (
            <section className="rules" aria-label="Rules">
              <KitRulesFields
                game={game}
                rules={rules}
                onChange={(patch) => setRules((r) => ({ ...r, ...patch }))}
              />
              <div className="rule-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={saveAs}
                  disabled={errors.length > 0}
                >
                  Save these rules
                </button>
                {isSaved && (
                  <button
                    type="button"
                    className="link danger"
                    onClick={() => {
                      deleteKitPreset(id, rules.id);
                      setSaved(loadSavedKit(id));
                      setRules(game.presets[0]);
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              {errors.length > 0 && <p className="error">{errors.join(" ")}</p>}
            </section>
          )}
        </>
      }
      actions={
        <>
          {game.practice === false ? (
            // A game that needs people (Draw & Guess): computer players can only keep it moving.
            <p className="fine">This one needs people: computer players can't draw. Start a family table{online ? "" : ", or play on this wifi"}.</p>
          ) : (
            <button
              type="button"
              className="primary deal"
              disabled={errors.length > 0}
              onClick={() => {
                remember();
                onPractice(name.trim() || "You", rules, tableSeats, people > 1 ? Array.from({ length: people - 1 }, (_, i) => personName(others[i], i + 1)) : undefined);
              }}
            >
              {solo ? "Deal" : people > 1 ? "Play together on this device" : "Practice against the computer"}
            </button>
          )}
          {record.played > 0 && <p className="record-line">Your record: {recordLine(record)}</p>}
          {!solo && <p className="with-people">{game.practice === false ? "Play" : "Play with people"}</p>}
          {!solo && (
            <button
              type="button"
              className={game.practice === false ? "primary deal" : "secondary"}
              disabled={errors.length > 0 || busy || !online}
              onClick={async () => {
                setBusy(true);
                setProblem(null);
                remember();
                try {
                  await onFamilyTable(rules, game.teams ? 4 : seats);
                } catch {
                  setProblem(
                    "Couldn't reach the parlor. Try again in a minute.",
                  );
                  setBusy(false);
                }
              }}
            >
              Start a family table
            </button>
          )}
          {!solo && (
            <>
            <button
              type="button"
              className="secondary"
              disabled={errors.length > 0 || busy || !online}
              onClick={async () => {
                setBusy(true);
                setProblem(null);
                remember();
                try {
                  await onFindPlayers(name.trim(), rules, game.teams ? 4 : seats);
                } catch (e) {
                  setProblem(lobbyProblem(e));
                  setBusy(false);
                }
              }}
            >
              Find players
            </button>
          <SameRulesToggle />
            </>
          )}
          {/* Hosting on this wifi is for when the internet is out; online, a family table does it better. */}
          {!solo && onWifi && !online && (
            <button
              type="button"
              className="secondary"
              disabled={errors.length > 0}
              onClick={() => {
                remember();
                onWifi(name.trim() || "You", rules, tableSeats);
              }}
            >
              📶 Play on this wifi
            </button>
          )}
          {!online && <p className="fine">{OFFLINE_LINE}</p>}
          {problem && <p className="error">{problem}</p>}
        </>
      }
      more={
        <>
          {!solo && (
            <ChallengeLink name={name} kitRules={{ [id]: rules }} />
          )}
          {!solo ? (
            <p className="fine">
              Houses keep {game.name} rules, tables and a leaderboard too. Make
              one from the Spades screen.
            </p>
          ) : (
            <p className="fine">A game just for you: nobody's waiting on you, so take your time.</p>
          )}
        </>
      }
    />
  );
}
