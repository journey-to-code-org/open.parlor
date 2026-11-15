// A table's deck: the cards everyone at the table (and anyone watching) sees. The players choose
// it before the deal, from the card room's own decks, their own designs and the gallery; the
// server keeps the table's copy, so it can't change under a game. A house picks the same way the
// deck its tables start with.
import { STARTERS, deckVars, type CardDesign, type TableDeck } from "@journey-to-code/decks";
import PlayingCard from "@open-parlor/ui/playing-card.zb";
import SelectField from "@open-parlor/ui/zubra-ui/select-field.zb";
import type { Card } from "@journey-to-code/rules";
import { useEffect, useState } from "react";

interface Saved {
  id: string;
  author: string;
  design: CardDesign;
  mine: boolean;
}

const OWN = "";
const SAMPLE: Card[] = [
  { kind: "pip", suit: "spades", rank: 14 },
  { kind: "pip", suit: "diamonds", rank: 12 },
];

async function designs(path: string): Promise<Saved[]> {
  try {
    const response = await fetch(`/designs${path}`, { credentials: "same-origin" });
    const body = (await response.json()) as { designs?: Saved[] };
    return response.ok && Array.isArray(body.designs) ? body.designs : [];
  } catch {
    return [];
  }
}

/** Three cards in a design: its back and two faces. */
function Preview({ design }: { design: CardDesign | null }) {
  return (
    <div className="deck-preview" style={design ? (deckVars(design) as React.CSSProperties) : undefined} aria-hidden>
      <PlayingCard back size="mini" />
      {SAMPLE.map((card, i) => (
        <PlayingCard key={i} card={card} size="mini" />
      ))}
    </div>
  );
}

/**
 * A deck chosen from the card room's own, the chooser's designs and the gallery. `save` sends the
 * choice (a design's id, or null for the card room's own) and throws with what to tell them.
 */
function DeckPicker({ deck, canChoose, save, label, description, line, onProblem }: { deck: TableDeck | null; canChoose: boolean; save: (design: string | null) => Promise<unknown>; label: string; description: string; /** What someone not choosing reads before the deck's name. */ line: string; onProblem: (message: string | null) => void }) {
  const [mine, setMine] = useState<Saved[]>([]);
  const [gallery, setGallery] = useState<Saved[]>([]);
  // What was just picked, until the server's answer arrives.
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!canChoose) return;
    let on = true;
    void Promise.all([designs("/mine"), designs("")]).then(([m, g]) => {
      if (!on) return;
      setMine(m);
      setGallery(g.filter((d) => !d.mine));
    });
    return () => {
      on = false;
    };
  }, [canChoose]);
  useEffect(() => setPicked(null), [deck?.id]);

  if (!canChoose) {
    // Someone not choosing still sees what the cards are.
    if (!deck) return null;
    return (
      <p className="deck-line">
        <Preview design={deck.design} />
        <span>
          {line} <strong>{deck.design.name}</strong> by {deck.author}
        </span>
      </p>
    );
  }

  const value = picked ?? deck?.id ?? OWN;
  const options = [
    { value: OWN, label: "The card room's own deck" },
    ...STARTERS.filter((s) => s.name !== "Classic").map((s) => ({ value: `starter:${s.name}`, label: s.name })),
    ...mine.map((d) => ({ value: d.id, label: `${d.design.name} (yours)` })),
    ...gallery.map((d) => ({ value: d.id, label: `${d.design.name} by ${d.author}` })),
  ];
  // The chosen deck may have left the gallery since; it's still the one chosen.
  if (deck && !options.some((o) => o.value === deck.id)) options.push({ value: deck.id, label: `${deck.design.name} by ${deck.author}` });
  const shown = value === OWN ? null : (STARTERS.find((s) => `starter:${s.name}` === value) ?? [...mine, ...gallery].find((d) => d.id === value)?.design ?? deck?.design ?? null);

  async function choose(next: string) {
    setPicked(next);
    onProblem(null);
    try {
      await save(next === OWN ? null : next);
    } catch (error) {
      setPicked(null);
      onProblem((error as Error).message);
    }
  }

  return (
    <section className="house-block deck-block" aria-label="The cards">
      <div className="deck-choice">
        <SelectField label={label} description={description} options={options} value={value} onValueChange={(e: CustomEvent<string>) => void choose(e.detail)} />
        <Preview design={shown} />
      </div>
      <a className="link" href="designer/" target="_blank" rel="noopener">
        Design your own deck
      </a>
    </section>
  );
}

export function TableDeckPicker({ table, deck, canChoose, onProblem }: { table: string; deck: TableDeck | null; canChoose: boolean; onProblem: (message: string | null) => void }) {
  async function save(design: string | null) {
    const response = await fetch(`/designs/table/${encodeURIComponent(table)}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ design }) });
    if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't change the cards.");
  }
  return <DeckPicker deck={deck} canChoose={canChoose} save={save} label="Cards" description="Everyone at the table sees this deck." line="Playing with" onProblem={onProblem} />;
}

/** The deck a house's tables start with: its owner and admins choose; everyone in the house sees which. */
export function HouseDeckPicker({ deck, canChoose, save }: { deck: TableDeck | null; canChoose: boolean; save: (design: string | null) => Promise<unknown> }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <DeckPicker deck={deck} canChoose={canChoose} save={save} label="House cards" description="New tables in this house start with this deck. The players can still pick another before the deal." line="House cards:" onProblem={setProblem} />
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </>
  );
}
