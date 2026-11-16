// The middle of a mahjong table: the stacked layout of Mahjong Shanghai, and the rivers of Mahjong
// Riichi (each seat's discards, the dora indicators and the wall).
import type { Center, KCard } from "@journey-to-code/games";
import type { CSSProperties } from "react";
import CardFace from "@open-parlor/ui/playing-card.zb";

type Tiles = Extract<Center, { kind: "tiles" }>;
type Rivers = Extract<Center, { kind: "rivers" }>;

/** Shanghai: tiles by half-tile coordinates, higher layers drawn on top and nudged up and across. */
export function TilesArea({ center, send }: { center: Tiles; send: (move: Record<string, unknown>) => void }) {
  const can = new Set(center.tap?.tiles ?? []);
  const list = [...center.tiles].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  return (
    <div className="mj-stack" style={{ "--cols": center.width + 1, "--rows": center.height + 1 } as CSSProperties} role="group" aria-label={`${center.tiles.length} tiles, ${center.matches} pairs to take`}>
      {list.map((t) => {
        const style = { "--x": t.x, "--y": t.y, "--z": t.z } as CSSProperties;
        const face = (
          <span className={`mj-tile${t.free ? " free" : ""}${t.selected ? " picked" : ""}${t.tile.family === "dragon" && t.tile.rank === 1 ? " red" : ""}`}>
            <span aria-hidden="true">{t.glyph}</span>
          </span>
        );
        return can.has(t.id) ? (
          <button key={t.id} type="button" className="mj-slot" style={style} aria-label={`${t.name}${t.selected ? ", picked" : ""}`} aria-pressed={t.selected} onClick={() => send({ type: center.tap!.type, tile: t.id })}>
            {face}
          </button>
        ) : (
          <span key={t.id} className="mj-slot" style={style} role="img" aria-label={t.name}>
            {face}
          </span>
        );
      })}
    </div>
  );
}

/** Riichi: a river in front of each seat (the player at the bottom is you), the indicators between. */
export function RiversArea({ center, me, names }: { center: Rivers; me: number; names: string[] }) {
  const seats = center.rivers.length;
  const place = (seat: number) => ["bottom", "right", "top", "left"][(seat - me + seats) % seats]!;
  const tile = (card: KCard, riichi: boolean, claimed: boolean, key: string, last: boolean) => (
    <span key={key} className={`mj-river-tile${riichi ? " riichi" : ""}${claimed ? " claimed" : ""}${last ? " last" : ""}`}>
      <CardFace card={card} size="mini" />
    </span>
  );
  return (
    <div className="mj-rivers" role="group" aria-label="The discards">
      {center.rivers.map((r) => (
        <div key={r.seat} className={`mj-river ${place(r.seat)}`} aria-label={`${names[r.seat] ?? `Seat ${r.seat + 1}`}'s discards`}>
          <small>{names[r.seat]}</small>
          <div className="mj-river-tiles">{r.tiles.map((t, i) => tile(t.card, t.riichi, t.claimed, `${i}`, center.last?.seat === r.seat && center.last.index === i))}</div>
        </div>
      ))}
      <div className="mj-core">
        <div className="mj-dora" aria-label="Dora indicators">
          {center.indicators.map((c) => (
            <CardFace key={c.id} card={c} size="mini" />
          ))}
        </div>
        <small>{center.wall} in the wall</small>
      </div>
    </div>
  );
}
