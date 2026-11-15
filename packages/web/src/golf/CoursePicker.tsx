// Which course Mini Golf is played on: the built-in ones, everyone's shared courses, and your own.
// Shown on Mini Golf's setup screen, with the way into the course editor.
import { COURSES } from "@journey-to-code/games";
import { isCustomCourse } from "@open-parlor/courses";
import SelectField from "@open-parlor/ui/zubra-ui/select-field.zb";
import { useEffect, useState } from "react";
import { courses, type SavedCourse } from "./coursesApi";

type Rules = { id: string; name: string } & Record<string, unknown>;

/** These rules on that course: every hole of it, unless the rules ask for fewer. */
export function onCourse(rules: Rules, course: string): Rules {
  const found = COURSES.find((c) => c.id === course);
  const holes = found?.holes.length ?? 9;
  const wanted = Number(rules.holes) || holes;
  if (!isCustomCourse(course)) return { ...rules, course, holes: Math.min(wanted, holes) };
  // A course people made is played whole, and the rules are called after it, not "Nine holes".
  const how = rules.order === "together" ? "all at once" : "in turn";
  return { ...rules, course, holes, name: `${found?.name ?? "A course"}, ${how}`.slice(0, 30) };
}

export function CoursePicker({ rules, onChange, onEdit }: { rules: Rules; onChange: (rules: Rules) => void; onEdit: (id: string) => void }) {
  const [list, setList] = useState<SavedCourse[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let live = true;
    courses.list().then(
      (found) => {
        if (!live) return;
        setList(found);
        // A course that was chosen last time and isn't there now (deleted, taken down): back to the garden.
        if (isCustomCourse(rules.course) && !found.some((c) => c.game === rules.course)) onChange(onCourse(rules, COURSES[0]!.id));
        // A course of yours that has changed since: its latest holes.
        else {
          const newer = found.find((c) => isCustomCourse(rules.course) && rules.course.startsWith(`custom-${c.id}-`) && c.game !== rules.course);
          if (newer) onChange(onCourse(rules, newer.game));
          // Now that it's where the game finds it, the setup can check the rules again.
          else if (isCustomCourse(rules.course)) onChange({ ...rules });
        }
      },
      () => {
        if (!live) return;
        setOffline(true);
        setList([]);
        if (isCustomCourse(rules.course)) onChange(onCourse(rules, COURSES[0]!.id));
      },
    );
    return () => {
      live = false;
    };
    // Asked once, as the setup opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const builtIn = COURSES.filter((c) => !isCustomCourse(c.id));
  const mine = (list ?? []).filter((c) => c.mine);
  const theirs = (list ?? []).filter((c) => !c.mine);
  const holes = (n: number) => (n === 1 ? "1 hole" : `${n} holes`);
  const options = [
    ...builtIn.map((c) => ({ value: c.id, label: `${c.name} (${holes(c.holes.length)})` })),
    ...mine.map((c) => ({ value: c.game, label: `${c.course.name}: yours${c.shared ? "" : ", not shared"} (${holes(c.course.holes.length)})` })),
    ...theirs.map((c) => ({ value: c.game, label: `${c.course.name}, by ${c.author} (${holes(c.course.holes.length)})` })),
  ];
  const chosen = (list ?? []).find((c) => c.game === rules.course);

  return (
    <div className="golf-course-pick">
      <SelectField label="Course" value={String(rules.course ?? builtIn[0]!.id)} options={options} onValueChange={(e: CustomEvent<string>) => onChange(onCourse(rules, e.detail))} />
      <div className="rule-actions">
        {chosen?.mine && (
          <button type="button" className="link" onClick={() => onEdit(chosen.id)}>
            Change this course
          </button>
        )}
        {chosen && !chosen.mine && (
          <button type="button" className="link" onClick={() => onEdit(chosen.id)}>
            Make a copy to change
          </button>
        )}
        {!offline && (
          <button type="button" className="link" onClick={() => onEdit("new")}>
            Make your own course
          </button>
        )}
      </div>
      {chosen?.hidden && <p className="fine">The parlor's host took this course out of the gallery: “{chosen.hidden}”. Only you can see it.</p>}
    </div>
  );
}
