// Which lane Bowling is played on: the plain lane, everyone's shared lanes, and your own. Shown on
// Bowling's setup screen, with the way into the lane editor.
import { laneOf, plainLane } from "@journey-to-code/games";
import { isCustomMap } from "@open-parlor/courses";
import SelectField from "@open-parlor/ui/zubra-ui/select-field.zb";
import { useEffect, useState } from "react";
import { lanes, type SavedLane } from "./coursesApi";

type Rules = { id: string; name: string } & Record<string, unknown>;

const FRAMES = (rules: Rules) => (Number(rules.frames) === 5 ? "quick five" : "ten frames");

/** These rules on that lane. On a lane people made, the rules are called after it. */
export function onLane(rules: Rules, lane: string, name?: string): Rules {
  if (!isCustomMap(lane)) {
    const { lane: _gone, ...rest } = rules;
    return rest as Rules;
  }
  const found = laneOf(lane);
  const label = `${name ?? (found.id === lane ? found.name : "A lane")}, ${FRAMES(rules)}`.slice(0, 30);
  return { ...rules, lane, name: label };
}

export function LanePicker({ rules, onChange, onEdit }: { rules: Rules; onChange: (rules: Rules) => void; onEdit: (id: string) => void }) {
  const [list, setList] = useState<SavedLane[] | null>(null);
  const [offline, setOffline] = useState(false);
  const chosenId = isCustomMap(rules.lane) ? rules.lane : plainLane.id;

  useEffect(() => {
    let live = true;
    lanes.list().then(
      (found) => {
        if (!live) return;
        setList(found);
        if (!isCustomMap(rules.lane)) return;
        // A lane chosen last time that isn't there now: back to the plain lane. One of yours that has changed: its latest.
        const newer = found.find((l) => (rules.lane as string).startsWith(`custom-${l.id}-`));
        if (!newer) onChange(onLane(rules, plainLane.id));
        else onChange(onLane(rules, newer.game, newer.course.name));
      },
      () => {
        if (!live) return;
        setOffline(true);
        setList([]);
        if (isCustomMap(rules.lane)) onChange(onLane(rules, plainLane.id));
      },
    );
    return () => {
      live = false;
    };
    // Asked once, as the setup opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mine = (list ?? []).filter((l) => l.mine);
  const theirs = (list ?? []).filter((l) => !l.mine);
  const options = [
    { value: plainLane.id, label: "The plain lane" },
    ...mine.map((l) => ({ value: l.game, label: `${l.course.name}: yours${l.shared ? "" : ", not shared"}` })),
    ...theirs.map((l) => ({ value: l.game, label: `${l.course.name}, by ${l.author}` })),
  ];
  const chosen = (list ?? []).find((l) => l.game === chosenId);

  return (
    <div className="golf-course-pick">
      <SelectField
        label="Lane"
        value={chosenId}
        options={options}
        onValueChange={(e: CustomEvent<string>) => onChange(onLane(rules, e.detail, (list ?? []).find((l) => l.game === e.detail)?.course.name))}
      />
      <div className="rule-actions">
        {chosen?.mine && (
          <button type="button" className="link" onClick={() => onEdit(chosen.id)}>
            Change this lane
          </button>
        )}
        {chosen && !chosen.mine && (
          <button type="button" className="link" onClick={() => onEdit(chosen.id)}>
            Make a copy to change
          </button>
        )}
        {!offline && (
          <button type="button" className="link" onClick={() => onEdit("new")}>
            Make your own lane
          </button>
        )}
      </div>
      {chosen?.hidden && <p className="fine">The parlor's host took this lane out of the gallery: “{chosen.hidden}”. Only you can see it.</p>}
    </div>
  );
}
