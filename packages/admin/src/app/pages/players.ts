// Everyone who's sat down here: block or unblock them.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, effect, inject, signal } from "@angular/core";
import { Admin, detailOf } from "../admin";
import type { Player } from "../api";
import { Ask } from "../ask";

/** Ask, then block some players. Used from this list and from a seat at a table. */
export function askBlock(ask: Ask, players: Player[], after: () => void = () => {}): void {
  if (!players.length) return;
  const one = players.length === 1 ? players[0]! : null;
  ask.ask({
    title: one ? `Block ${one.name}?` : `Block ${players.length} players?`,
    body: `${one ? "They" : "Each of them"} won't be able to sit at a table, play, chat, open a house or share card designs here. Tables they're at carry on without them. You can unblock ${one ? "them" : "anyone"} later.`,
    field: "Reason",
    help: "Only you see this: it's a note for the list.",
    action: one ? "Block player" : `Block ${players.length} players`,
    run: async (reason) => {
      for (const p of players) await ask.admin.api.block(p.ref, reason);
      after();
      return one ? `Blocked ${one.name}.` : `Blocked ${players.length} players.`;
    },
  });
}

@Component({
  selector: "app-players",
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <p class="quiet">Players are browsers, not accounts: a name is whatever they typed when they sat down.</p>
      <cluster-layout gap="0.5rem" justify="flex-end">
        <action-button variant="outline" size="sm" [disabled]="!toUnblock().length" (click)="unblock(toUnblock())">
          {{ toUnblock().length > 1 ? "Unblock " + toUnblock().length : "Unblock" }}
        </action-button>
        <action-button variant="destructive" size="sm" [disabled]="!toBlock().length" (click)="block(toBlock())">
          {{ toBlock().length > 1 ? "Block " + toBlock().length + " players" : "Block player" }}
        </action-button>
      </cluster-layout>
    </div>
    @if (admin.players().length) {
      <data-table label="Players" [columns]="columns" [rows]="rows()" [selectable]="true" [pageSize]="15" [selected]="picked()" (selectedchange)="picked.set(detailOf($event))"></data-table>
    } @else {
      <empty-state heading="No players yet">Everyone who sits at a table, joins a house or saves a card design shows up here.</empty-state>
    }
  `,
})
export class PlayersPage {
  protected readonly admin = inject(Admin);
  private readonly ask = inject(Ask);
  protected readonly detailOf = detailOf;
  protected readonly columns = [
    { key: "name", label: "Name", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "seated", label: "At tables", sortable: true, format: "number" },
    { key: "houses", label: "Houses" },
    { key: "designs", label: "Designs", sortable: true, format: "number" },
    { key: "aka", label: "Also seen as" },
  ];
  protected readonly rows = computed(() =>
    this.admin.players().map((p) => ({
      id: p.ref,
      name: p.name,
      status: p.ban ? (p.ban.reason ? `Blocked: ${p.ban.reason}` : "Blocked") : p.seated ? "At a table" : "",
      seated: p.seated,
      houses: p.houses.map((h) => (h.role === "member" ? h.name : `${h.name} (${h.role})`)).join(", "),
      designs: p.designs,
      aka: p.names.filter((n) => n !== p.name).join(", "),
    })),
  );
  protected readonly picked = signal<string[]>([]);
  protected readonly toBlock = computed(() => this.admin.players().filter((p) => this.picked().includes(p.ref) && !p.ban));
  protected readonly toUnblock = computed(() => this.admin.players().filter((p) => this.picked().includes(p.ref) && p.ban));

  constructor() {
    // A selection only makes sense for rows that are still there.
    effect(() => {
      const refs = new Set(this.admin.players().map((p) => p.ref));
      this.picked.update((picked) => (picked.every((ref) => refs.has(ref)) ? picked : picked.filter((ref) => refs.has(ref))));
    });
  }

  protected block(players: Player[]): void {
    askBlock(this.ask, players, () => this.picked.set([]));
  }

  protected async unblock(players: Player[]): Promise<void> {
    await this.admin.act(async () => {
      for (const p of players) await this.admin.api.unblock(p.ref);
      this.picked.set([]);
      return players.length === 1 ? `Unblocked ${players[0]!.name}.` : `Unblocked ${players.length} players.`;
    });
  }
}
