// A meet: people in one place, each of whom can say something to the rest.
//
// It is for games where every device runs its own player and only tells the others about it
// (Road to the Shootout's races: each engine drives its own car). The room says who is here,
// puts who a message is from on it, and passes it on, to the one member it names or to everyone
// else. It never looks further into a message than that, and keeps nothing.
//
// Everything is a line of JSON. A device says {"t":"hello","name":…} first; the room answers
// {"t":"you","id":…,"members":[…]} and tells the others {"t":"join",…}. After that whatever a
// member says goes on with "from" added. {"t":"left","id":…} when one goes.
import { cleanName } from "./protocol.ts";
import type { Link, Seat } from "./room.ts";

export interface MeetOptions {
  /** Milliseconds, from any starting point. */
  now(): number;
  /** As many members as this, and the next is turned away. */
  most?: number;
  /** The longest message passed on, in characters. */
  longest?: number;
  /** How many messages a member may send in any one second: more are dropped. */
  rate?: number;
}

interface Guest {
  id: number;
  name: string;
  link: Link;
  joined: boolean;
  /** The second being counted, and how many messages have come in it. */
  second: number;
  said: number;
}

/** What the room itself says: a member's own messages may not pretend to be these. */
const OURS = new Set(["you", "join", "left", "full"]);

export class Meet {
  readonly name: string;
  private options: Required<MeetOptions>;
  private guests: Guest[] = [];
  private nextId = 1;

  constructor(name: string, options: MeetOptions) {
    this.name = name;
    this.options = { most: 16, longest: 1024, rate: 30, ...options };
  }

  get empty(): boolean {
    return this.guests.length === 0;
  }

  /** How many have said hello. */
  get size(): number {
    return this.guests.filter((guest) => guest.joined).length;
  }

  /** A device has connected. */
  join(link: Link): Seat {
    const guest: Guest = { id: this.nextId++, name: "", link, joined: false, second: 0, said: 0 };
    this.guests.push(guest);
    return {
      receive: (data) => {
        if (typeof data !== "string" || data.length > this.options.longest) return;
        const second = Math.floor(this.options.now() / 1000);
        if (second !== guest.second) [guest.second, guest.said] = [second, 0];
        if (++guest.said > this.options.rate) return;
        let message: unknown;
        try {
          message = JSON.parse(data);
        } catch {
          return;
        }
        if (typeof message !== "object" || message === null || Array.isArray(message)) return;
        this.said(guest, message as Record<string, unknown>);
      },
      leave: () => this.left(guest),
    };
  }

  private said(guest: Guest, message: Record<string, unknown>) {
    if (!guest.joined) {
      if (message.t !== "hello") return;
      if (this.size >= this.options.most) {
        guest.link.send(JSON.stringify({ t: "full" }));
        return guest.link.close();
      }
      guest.name = cleanName(message.name);
      guest.joined = true;
      const members = this.guests.filter((g) => g.joined).map(({ id, name }) => ({ id, name }));
      guest.link.send(JSON.stringify({ t: "you", id: guest.id, members }));
      for (const other of this.guests) if (other !== guest && other.joined) other.link.send(JSON.stringify({ t: "join", id: guest.id, name: guest.name }));
      return;
    }
    if (typeof message.t !== "string" || message.t === "hello" || OURS.has(message.t)) return;
    const text = JSON.stringify({ ...message, from: guest.id });
    for (const other of this.guests) {
      if (other === guest || !other.joined) continue;
      if (message.to !== undefined && message.to !== other.id) continue;
      other.link.send(text);
    }
  }

  private left(guest: Guest) {
    const at = this.guests.indexOf(guest);
    if (at < 0) return;
    this.guests.splice(at, 1);
    if (guest.joined) for (const other of this.guests) if (other.joined) other.link.send(JSON.stringify({ t: "left", id: guest.id }));
  }
}

/** The meets a server keeps, by name. One is made when someone first comes to it and forgotten when the last leaves. */
export class Meets {
  private meets = new Map<string, Meet>();
  private options: MeetOptions;
  private most: number;

  /** `most`: as many meets as this at once, and no more are made. */
  constructor(options: MeetOptions, most = 50) {
    this.options = options;
    this.most = most;
  }

  /** The meet of this name, made if need be; or null if the name will not do or there are too many. */
  at(name: string): Meet | null {
    if (!/^[a-z0-9-]{1,24}$/.test(name)) return null;
    this.sweep();
    let meet = this.meets.get(name);
    if (!meet) {
      if (this.meets.size >= this.most) return null;
      meet = new Meet(name, this.options);
      this.meets.set(name, meet);
    }
    return meet;
  }

  get count(): number {
    return this.meets.size;
  }

  /** Forget the ones nobody is in. */
  sweep(): void {
    for (const [name, meet] of this.meets) if (meet.empty) this.meets.delete(name);
  }
}
