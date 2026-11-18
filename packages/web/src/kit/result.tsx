// How a round came out, as a table, and the name of a side of it. Every kind of table shows one
// (cards, boards, words, table sports), so it is in a file of its own: a table that isn't the card
// table doesn't have to bring the card table along to draw it.
import type { KitView } from "@journey-to-code/games";
import { named } from "./named";

/** "Ann & Cy" for a side of the table. */
export const sideName = (seats: number[], names: string[]) =>
  seats.map((s) => names[s] ?? `Seat ${s + 1}`).join(" & ");

export function ResultTable({
  result,
  names,
  me,
  untitled,
}: {
  result: NonNullable<KitView["result"]>;
  names: string[];
  me: number;
  untitled?: boolean;
}) {
  return (
    <>
      {!untitled && <h2>{named(result.title, names)}</h2>}
      <table className="summary">
        <thead>
          <tr>
            <th scope="col" />
            {result.sides.map((seats, i) => (
              <th
                key={i}
                scope="col"
                className={seats.includes(me) ? "us" : ""}
              >
                {sideName(seats, names)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.label} className={row.tone === "total" ? "total" : ""}>
              <th scope="row">{row.label}</th>
              {row.values.map((v, i) => (
                <td
                  key={i}
                  className={
                    row.tone === "score"
                      ? v.startsWith("-") || v.startsWith("−")
                        ? "neg"
                        : "pos"
                      : ""
                  }
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
