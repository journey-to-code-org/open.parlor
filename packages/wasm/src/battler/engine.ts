// The rules of Delbie's Back Room, a deck-building battler: no screen in it, so any framework can draw
// it and a test can play it. A run is a seed and the commands given, so the same seed and commands
// always come out the same, which `replay` and `hash` rely on.
//
// A run is five fights. In a fight you draw a hand, spend energy playing cards on the foes or on
// yourself, and end the turn; the foes then do what they showed they would. After a fight you may
// add one of three cards to the deck and put one card back on the shelf (take it out), then go on.
import { FLOORS, STARTING_DECK, type CardDef, type Intent } from "./cards.ts";
import { DEFAULT_MAX_HP, DEFAULT_REST, DEFAULT_TABLES, type Tables } from "./tables.ts";

/** The game's own hit points and healing; a run may be played on tables that change them. */
export const MAX_HP = DEFAULT_MAX_HP;
export const ENERGY = 3;
export const HAND = 5;
export const HAND_LIMIT = 10;
/** Healed between fights. */
export const REST = DEFAULT_REST;
export const OFFERS = 3;

export interface Card {
  /** Stays the same all run, so a card keeps its place on screen as it moves between piles. */
  uid: number;
  def: string;
}

export interface Foe {
  uid: number;
  def: string;
  name: string;
  art: string;
  hp: number;
  maxHp: number;
  block: number;
  vulnerable: number;
  /** What it will do on its next turn. */
  intent: Intent;
  step: number;
}

export type Phase = "fight" | "reward" | "won" | "lost";

export interface View {
  seed: number;
  phase: Phase;
  floor: number;
  floorName: string;
  floors: number;
  turn: number;
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  draw: readonly Card[];
  hand: readonly Card[];
  discard: readonly Card[];
  /** Every card the run has, wherever it is now. */
  deck: readonly Card[];
  foes: readonly Foe[];
  /** After a fight: three cards to take one of, and whether a card has been put back yet. */
  offers: readonly string[];
  removed: boolean;
  taken: boolean;
  /** What happened in the last command, in order. */
  news: readonly string[];
}

export type Command =
  | { t: "play"; uid: number; target?: number }
  | { t: "move"; uid: number; to: number }
  | { t: "end" }
  | { t: "take"; index: number }
  | { t: "remove"; uid: number }
  | { t: "go" };

export type Refusal = "not now" | "no such card" | "no energy" | "pick a foe" | "no such foe" | "already done" | "no such offer" | "hand full";
export type Result = { ok: true } | { ok: false; why: Refusal };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const no = (why: Refusal): Result => ({ ok: false, why });
const yes: Result = { ok: true };

export class Battle {
  private random: () => number;
  /** The generator's place, so a run can be hashed. */
  private pulls = 0;
  private nextUid = 1;
  private s: Omit<View, "news" | "floors" | "floorName" | "deck" | "seed" | "draw" | "hand" | "discard" | "foes" | "offers"> & { news: string[]; draw: Card[]; hand: Card[]; discard: Card[]; foes: Foe[]; offers: string[] };
  private cards: Card[] = [];

  constructor(
    public readonly seed: number,
    /** The numbers this run is played on. */
    public readonly tables: Tables = DEFAULT_TABLES,
  ) {
    const base = mulberry32(seed);
    this.random = () => (this.pulls++, base());
    this.cards = STARTING_DECK.map((id) => this.make(id));
    this.s = { phase: "fight", floor: 0, turn: 0, hp: tables.maxHp, maxHp: tables.maxHp, block: 0, energy: 0, draw: [], hand: [], discard: [], foes: [], offers: [], removed: false, taken: false, news: [] };
    this.begin();
  }

  private def(card: Card): CardDef {
    return this.tables.cardById[card.def]!;
  }

  private make(id: string): Card {
    return { uid: this.nextUid++, def: id };
  }

  private say(line: string) {
    this.s.news.push(line);
  }

  private shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }

  /** The floor's foes come out and the first turn is dealt. */
  private begin() {
    const floor = FLOORS[this.s.floor]!;
    this.s.foes = floor.foes.map((id, n) => {
      const foe = this.tables.foes[id]!;
      return { uid: 1000 * (this.s.floor + 1) + n, def: id, name: foe.name, art: foe.art, hp: foe.hp, maxHp: foe.hp, block: 0, vulnerable: 0, intent: foe.pattern[0]!, step: 0 };
    });
    this.s.phase = "fight";
    this.s.turn = 0;
    this.s.hand = [];
    this.s.discard = [];
    this.s.draw = this.shuffle([...this.cards]);
    this.say(`${floor.name}.`);
    this.startTurn();
  }

  private startTurn() {
    this.s.turn++;
    this.s.block = 0;
    this.s.energy = ENERGY;
    this.drawCards(HAND);
  }

  private drawCards(count: number) {
    for (let n = 0; n < count; n++) {
      if (this.s.hand.length >= HAND_LIMIT) return;
      if (!this.s.draw.length) {
        if (!this.s.discard.length) return;
        this.s.draw = this.shuffle([...this.s.discard]);
        this.s.discard = [];
        this.say("The discard pile is shuffled back in.");
      }
      this.s.hand.push(this.s.draw.shift()!);
    }
  }

  private hitFoe(foe: Foe, amount: number) {
    const dealt = foe.vulnerable > 0 ? Math.floor(amount * 1.5) : amount;
    const soaked = Math.min(foe.block, dealt);
    foe.block -= soaked;
    foe.hp = Math.max(0, foe.hp - (dealt - soaked));
    this.say(`${foe.name} takes ${dealt - soaked}${soaked ? ` (${soaked} blocked)` : ""}.`);
  }

  private hitPlayer(amount: number) {
    const soaked = Math.min(this.s.block, amount);
    this.s.block -= soaked;
    this.s.hp = Math.max(0, this.s.hp - (amount - soaked));
    this.say(`You take ${amount - soaked}${soaked ? ` (${soaked} blocked)` : ""}.`);
  }

  private won() {
    this.s.foes = this.s.foes.filter((foe) => foe.hp > 0);
    if (this.s.foes.length) return false;
    // Every card goes back to the pile it came from, for the next fight.
    this.s.hand = [];
    this.s.draw = [];
    this.s.discard = [];
    if (this.s.floor === FLOORS.length - 1) {
      this.s.phase = "won";
      this.say("The back corner is quiet.");
      return true;
    }
    this.s.phase = "reward";
    this.s.hp = Math.min(this.s.maxHp, this.s.hp + this.tables.rest);
    this.s.block = 0;
    this.s.removed = false;
    this.s.taken = false;
    const pool = this.tables.cards.filter((card) => card.rarity !== "starter");
    const rare = this.s.floor >= 2;
    const picks: string[] = [];
    while (picks.length < OFFERS) {
      const from = pool.filter((card) => (card.rarity === "rare" ? this.random() < (rare ? 0.45 : 0.2) : true) && !picks.includes(card.id));
      const choice = from[Math.floor(this.random() * from.length)];
      if (choice) picks.push(choice.id);
    }
    this.s.offers = picks;
    this.say(`Floor cleared. You catch your breath (+${this.tables.rest}).`);
    return true;
  }

  /** Does what a card says. Returns false (and spends nothing) if it can't be played now. */
  private find(zone: readonly Card[], uid: number) {
    return zone.findIndex((card) => card.uid === uid);
  }

  command(command: Command): Result {
    this.s.news = [];
    const s = this.s;
    switch (command.t) {
      case "move": {
        if (s.phase !== "fight") return no("not now");
        const at = this.find(s.hand, command.uid);
        if (at < 0) return no("no such card");
        const [card] = s.hand.splice(at, 1);
        s.hand.splice(Math.max(0, Math.min(command.to, s.hand.length)), 0, card!);
        return yes;
      }
      case "play": {
        if (s.phase !== "fight") return no("not now");
        const at = this.find(s.hand, command.uid);
        if (at < 0) return no("no such card");
        const card = s.hand[at]!;
        const d = this.def(card);
        if (d.cost > s.energy) return no("no energy");
        const effect = d.effect;
        let targets: Foe[] = [];
        if (d.kind === "attack" || effect.vulnerable) {
          if (effect.all) targets = [...s.foes];
          else {
            if (command.target === undefined) return no("pick a foe");
            const foe = s.foes.find((f) => f.uid === command.target);
            if (!foe) return no("no such foe");
            targets = [foe];
          }
        }
        s.energy -= d.cost;
        s.hand.splice(at, 1);
        s.discard.push(card);
        this.say(`You play ${d.name}.`);
        if (effect.block) {
          s.block += effect.block;
          this.say(`+${effect.block} block.`);
        }
        if (effect.energy) {
          s.energy += effect.energy;
          this.say(`+${effect.energy} energy.`);
        }
        if (effect.heal) {
          s.hp = Math.min(s.maxHp, s.hp + effect.heal);
          this.say(`+${effect.heal} patience.`);
        }
        for (const foe of targets) {
          if (effect.vulnerable) {
            foe.vulnerable = Math.max(foe.vulnerable, effect.vulnerable);
            this.say(`${foe.name} is marked down.`);
          }
          for (let hit = 0; hit < (effect.hits ?? 1) && effect.damage; hit++) this.hitFoe(foe, effect.damage);
        }
        if (effect.draw) this.drawCards(effect.draw);
        this.won();
        return yes;
      }
      case "end": {
        if (s.phase !== "fight") return no("not now");
        s.discard.push(...s.hand);
        s.hand = [];
        // Block stays up through the foes' turn and goes when yours begins (startTurn).
        for (const foe of s.foes) {
          foe.block = 0;
          const intent = foe.intent;
          if (intent.kind === "attack") for (let hit = 0; hit < (intent.hits ?? 1); hit++) this.hitPlayer(intent.amount);
          else {
            foe.block += intent.amount;
            this.say(`${foe.name} covers up (+${intent.amount} block).`);
          }
          if (foe.vulnerable > 0) foe.vulnerable--;
          foe.step++;
          foe.intent = this.tables.foes[foe.def]!.pattern[foe.step % this.tables.foes[foe.def]!.pattern.length]!;
          if (s.hp <= 0) break;
        }
        if (s.hp <= 0) {
          s.phase = "lost";
          this.say("You've had enough for today.");
          return yes;
        }
        this.startTurn();
        return yes;
      }
      case "take": {
        if (s.phase !== "reward") return no("not now");
        if (s.taken) return no("already done");
        // -1 is to take nothing, which still counts as having chosen.
        if (command.index === -1) {
          s.taken = true;
          this.say("You leave the shelf as it is.");
          return yes;
        }
        const id = s.offers[command.index];
        if (!id) return no("no such offer");
        const card = this.make(id);
        this.cards.push(card);
        s.taken = true;
        this.say(`${this.tables.cardById[id]!.name} goes in the deck.`);
        return yes;
      }
      case "remove": {
        if (s.phase !== "reward") return no("not now");
        if (s.removed) return no("already done");
        const at = this.find(this.cards, command.uid);
        if (at < 0) return no("no such card");
        if (this.cards.length <= 5) return no("not now");
        const [gone] = this.cards.splice(at, 1);
        s.removed = true;
        this.say(`${this.def(gone!).name} goes back on the shelf.`);
        return yes;
      }
      case "go": {
        if (s.phase !== "reward") return no("not now");
        s.floor++;
        this.begin();
        return yes;
      }
    }
  }

  view(): View {
    const floor = FLOORS[this.s.floor]!;
    return {
      ...this.s,
      seed: this.seed,
      floors: FLOORS.length,
      floorName: floor.name,
      draw: [...this.s.draw],
      hand: [...this.s.hand],
      discard: [...this.s.discard],
      deck: [...this.cards],
      foes: this.s.foes.map((foe) => ({ ...foe })),
      offers: [...this.s.offers],
      news: [...this.s.news],
    };
  }

  /** Two runs with the same hash are in the same place with the same cards, in the same order. */
  hash(): number {
    const v = this.view();
    const text = JSON.stringify([v.phase, v.floor, v.turn, v.hp, v.block, v.energy, v.draw, v.hand, v.discard, v.deck, v.foes, v.offers, v.removed, v.taken, this.pulls]);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
    return hash >>> 0;
  }
}

/** Plays a seed and its commands from the start. Stops at the first command that is refused. */
export function replay(seed: number, commands: readonly Command[], tables: Tables = DEFAULT_TABLES): { battle: Battle; refused: number } {
  const battle = new Battle(seed, tables);
  for (let i = 0; i < commands.length; i++) if (!battle.command(commands[i]!).ok) return { battle, refused: i };
  return { battle, refused: -1 };
}
