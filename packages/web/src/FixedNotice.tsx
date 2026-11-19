// The note that a problem this player reported has been fixed (fixedNotice.ts). It waits until
// they're not at a table, says it once, and lets the report go when it's put away.
import { useEffect, useState } from "react";
import { lookForFixes, told, type Fixed } from "./fixedNotice";

/** Where an issue lives, for "See what changed". */
const ISSUES = "https://github.com/journey-to-code-org/open.parlor/issues/";

export function FixedNotice() {
  const [fixed, setFixed] = useState<Fixed[]>([]);
  useEffect(() => {
    let gone = false;
    // A moment after the page opens: it isn't what anyone came for.
    const soon = setTimeout(() => void lookForFixes().then((found) => !gone && setFixed(found)), 2500);
    return () => {
      gone = true;
      clearTimeout(soon);
    };
  }, []);
  if (!fixed.length) return null;
  const close = () => {
    told(fixed.map((f) => f.number));
    setFixed([]);
  };
  const one = fixed.length === 1 ? fixed[0]! : null;
  return (
    <div className="offline-toast fixed-toast" role="status">
      <p>
        <strong>
          <span aria-hidden>🛠️</span> {one ? "The problem you reported is fixed." : `${fixed.length} problems you reported are fixed.`}
        </strong>{" "}
        {one ? <>“{one.title}”. </> : null}Thank you for telling us: it's how the parlor gets better.
      </p>
      {!one && (
        <ul className="fixed-list">
          {fixed.map((f) => (
            <li key={f.number}>{f.title}</li>
          ))}
        </ul>
      )}
      <div className="offline-toast-actions">
        <button type="button" className="primary small" onClick={close}>
          Nice!
        </button>
        {one && (
          <a className="link" href={`${ISSUES}${one.number}`} target="_blank" rel="noreferrer" onClick={close}>
            See what changed
          </a>
        )}
      </div>
    </div>
  );
}
