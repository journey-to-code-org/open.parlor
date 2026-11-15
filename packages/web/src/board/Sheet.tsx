// A score sheet on the board table (the view's `sheet`): Yacht's scorecard. The engine's sheet has
// a column per thing scored and a row per player; a scorecard reads better the other way up, so
// here each box is a line down the page and each player a column across it. Your own column comes
// first and stays put, beside the names of the boxes, while the others' scroll sideways behind it
// if there are many. On a phone you get your own sheet alone, folded in two so all of it is on the
// screen, and a button for everyone's.
//
// A cell you can choose is a button showing what it would score, and says so: "Full house: would
// score 25". Choosing it is the move.
import type { ScoreSheet, SheetRow } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";
import { play } from "../feedback/sounds";

export interface SheetProps {
  sheet: ScoreSheet;
  names: string[];
  me: number;
  /** A cell of your own row was chosen: the id of its column. */
  onPick: (type: string, cell: string) => void;
  /** The dice are still in the air: what each box would score waits until they land. */
  waiting?: boolean;
}

/** Whether the screen is as narrow as a phone held upright. */
function useNarrow(): boolean {
  const query = "(max-width: 640px)";
  const [narrow, setNarrow] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const on = () => setNarrow(media.matches);
    media.addEventListener("change", on);
    return () => media.removeEventListener("change", on);
  }, []);
  return narrow;
}

export function Sheet({ sheet, names, me, onPick, waiting }: SheetProps) {
  // You first, then the others in the order they sit after you.
  const mine = sheet.rows.find((r) => r.seat === me);
  const after = (seat: number) => (seat - me + sheet.rows.length) % sheet.rows.length;
  const rows = [...(mine ? [mine] : []), ...sheet.rows.filter((r) => r !== mine).sort((a, b) => after(a.seat) - after(b.seat))];
  const picks = new Map((waiting ? [] : (sheet.pick?.cells ?? [])).map((c) => [c.column, c.would]));
  const nameOf = (seat: number) => names[seat] ?? `Seat ${seat + 1}`;
  // On a phone your own sheet is all there's room for, folded in two like the paper one, so every
  // box is on the screen and big enough for a thumb. Everyone's sheets are a tap away.
  const narrow = useNarrow();
  const [everyone, setEveryone] = useState(false);
  const folded = narrow && !!mine && !everyone;

  // A box filled in: the pencil's tap.
  const lastKey = sheet.last ? `${sheet.last.seat}/${sheet.last.column}` : "";
  const seen = useRef(lastKey);
  useEffect(() => {
    if (lastKey && lastKey !== seen.current) play("bid");
    seen.current = lastKey;
  }, [lastKey]);

  /** One cell: the score written there, or a button for a box you can fill in now. */
  const cell = (r: SheetRow, c: number) => {
    const column = sheet.columns[c]!;
    const would = r.seat === me ? picks.get(c) : undefined;
    const last = sheet.last?.seat === r.seat && sheet.last.column === c;
    return (
      <td key={r.seat} className={`${r.seat === me ? "mine" : ""}${last ? " last" : ""}`}>
        {would !== undefined && column.id !== undefined ? (
          <button type="button" className={`pick${Number(would) === 0 ? " nothing" : ""}`} aria-label={`${column.label}: would score ${would}`} onClick={() => onPick(sheet.pick!.type, column.id!)}>
            {would}
          </button>
        ) : (
          r.cells[c]
        )}
      </td>
    );
  };
  const line = (c: number, shown: SheetRow[]) => {
    const column = sheet.columns[c]!;
    return (
      <tr key={c} className={`${column.kind === "sum" ? "worked" : ""}${sheet.current === c ? " now" : ""}`}>
        <th scope="row" title={column.sub}>
          {column.label}
          {column.sub && <small>{column.sub}</small>}
        </th>
        {shown.map((r) => cell(r, c))}
      </tr>
    );
  };
  const head = (
    <div className="sheet-head">
      <strong>{sheet.title}</strong>
      {narrow && mine && rows.length > 1 && (
        <button type="button" className="link" aria-pressed={everyone} onClick={() => setEveryone(!everyone)}>
          {everyone ? "Just my sheet" : "Everyone's sheets"}
        </button>
      )}
    </div>
  );

  if (folded) {
    // Folded where the sheet's own first half ends (after the top half's bonus), or else down the middle.
    const sum = sheet.columns.findIndex((c) => c.kind === "sum");
    const fold = sum > 0 && sum < sheet.columns.length - 2 ? sum + 1 : Math.ceil(sheet.columns.length / 2);
    const all = sheet.columns.map((_, c) => c);
    return (
      <div className={`score-sheet folded${picks.size ? " picking" : ""}`}>
        {head}
        <div className="sheet-halves">
          {[all.slice(0, fold), all.slice(fold)].map((half, i) => (
            <table key={i} aria-label={`${sheet.title}: ${nameOf(me)}, ${i === 0 ? "first" : "second"} half`}>
              <tbody>{half.map((c) => line(c, [mine]))}</tbody>
            </table>
          ))}
        </div>
        <p className="sheet-total">
          <span>{sheet.totalLabel}</span>
          <strong>{mine.total}</strong>
          {sheet.noteLabel && <span>{`${sheet.noteLabel} ${mine.note ?? ""}`}</span>}
        </p>
      </div>
    );
  }

  return (
    <div className={`score-sheet${rows.length > 3 ? " crowded" : ""}${picks.size ? " picking" : ""}`}>
      {head}
      {/* Every column has a set width, so the two that stay put while the rest scroll line up exactly. */}
      <table className="whole" aria-label={sheet.title} style={{ "--others": rows.length - (mine ? 1 : 0) } as React.CSSProperties}>
        <colgroup>
          <col className="boxes" />
          {rows.map((r) => (
            <col key={r.seat} className={r.seat === me ? "mine" : ""} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <td />
            {rows.map((r) => (
              <th key={r.seat} scope="col" className={r.seat === me ? "mine" : ""} title={nameOf(r.seat)}>
                <span>{nameOf(r.seat)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{sheet.columns.map((_, c) => line(c, rows))}</tbody>
        <tfoot>
          <tr>
            <th scope="row">{sheet.totalLabel}</th>
            {rows.map((r) => (
              <td key={r.seat} className={r.seat === me ? "mine" : ""}>
                {r.total}
              </td>
            ))}
          </tr>
          {sheet.noteLabel && (
            <tr className="worked">
              <th scope="row">{sheet.noteLabel}</th>
              {rows.map((r) => (
                <td key={r.seat} className={r.seat === me ? "mine" : ""}>
                  {r.note}
                </td>
              ))}
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}
