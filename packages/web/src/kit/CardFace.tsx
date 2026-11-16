// One card face for the whole kit table: playing cards and fruit cards go to the deck component,
// mahjong tiles are drawn here (a tile is a Unicode glyph on ivory, red for a red five or the red
// dragon). Everything in KitTable that used to draw a PlayingCard draws this instead.
import { tileGlyph, type KCard } from "@journey-to-code/games";
import Deck from "@open-parlor/ui/playing-card.zb";
import type { ComponentType, CSSProperties } from "react";

const Cards = Deck as unknown as ComponentType<Record<string, unknown>>;

type Props = { card?: KCard; back?: boolean; size?: string; [key: string]: unknown };

const WIDTH: Record<string, string> = { table: "var(--trick-w, 52px)", mini: "var(--mini-w, 34px)" };
const HEIGHT: Record<string, string> = { table: "var(--trick-h, 74px)", mini: "var(--mini-h, 48px)" };

export default function CardFace({ card, back, size = "hand", ...rest }: Props) {
  if (card?.kind === "tile" && !back) {
    const t = card.tile;
    const red = card.red || (t.family === "dragon" && t.rank === 1);
    const glyph = tileGlyph(t);
    const width = WIDTH[size] ?? "var(--card-w, 62px)";
    const height = HEIGHT[size] ?? "var(--card-h, 88px)";
    return (
      <span
        className={`tile-face${red ? " red" : ""}`}
        data-size={size}
        data-flip={rest["data-flip"] as string | undefined}
        role="img"
        aria-label={`${card.red ? "red " : ""}${t.family} ${t.rank}`}
        style={{ width, height, "--tile-w": width } as CSSProperties}
      >
        <span className="tile-glyph" aria-hidden="true">
          {glyph}
        </span>
        {card.red && <i className="tile-dot" aria-hidden="true" />}
      </span>
    );
  }
  return <Cards card={card} back={back} size={size} {...rest} />;
}
