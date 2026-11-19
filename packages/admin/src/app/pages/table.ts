// One table, at tables/<id>: who's there and what's been said, in a dialog over the list. Closing
// the dialog goes back to the list; the address can be sent to someone else who runs the parlor.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, effect, inject, input, resource, untracked } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Admin, STATUS_LABEL, detailOf, message } from "../admin";
import type { ChatLine, Table, TableStatus } from "../api";
import { Ask } from "../ask";
import { askBlock } from "./players";
import { askClose } from "./tables";

@Component({
  selector: "app-table",
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <modal-dialog [open]="true" (openchange)="!detailOf($event) && leave()" [label]="table() ? table()!.gameName + ' table ' + table()!.id : 'Table ' + id()">
      @if (detail.error(); as problem) {
        <alert-banner variant="danger" heading="Couldn't find that table">{{ problem.message }}</alert-banner>
      } @else if (detail.hasValue()) {
        @let d = detail.value();
        <stack-layout gap="1rem">
          <cluster-layout gap="0.4rem">
            <status-badge [variant]="variant(d.table.status)" [dot]="true">{{ label(d.table.status) }}</status-badge>
            @if (d.table.rules) {
              <status-badge variant="outline">{{ d.table.rules }}</status-badge>
            }
            @if (d.table.house) {
              <status-badge variant="outline">{{ d.table.house.name }}</status-badge>
            }
            @if (d.table.paused) {
              <status-badge variant="warning" [dot]="true">Paused</status-badge>
            }
          </cluster-layout>
          @if (d.table.closed) {
            <alert-banner variant="warning" heading="Closed">{{ d.table.closed }}</alert-banner>
          }

          @if (d.table.paused) {
            <alert-banner variant="warning" heading="Paused">{{ d.table.paused.reason || "Nobody can play until you resume." }} Players can still chat.</alert-banner>
          }

          <div>
            <h3 class="sub">Seats</h3>
            <ul class="seats">
              @for (seat of d.table.seats; track seat.seat) {
                <li>
                  <user-avatar [name]="seat.name ?? ''" size="sm"></user-avatar>
                  <span class="who">
                    {{ seat.name ?? "Empty seat" }}
                    @if (seat.bot) {
                      <status-badge variant="neutral">Computer</status-badge>
                    }
                    @if (seat.blocked) {
                      <status-badge variant="danger">Blocked</status-badge>
                    }
                  </span>
                  @if (d.table.paused && seat.name !== null && d.table.status === "playing") {
                    <action-button variant="outline" size="sm" [label]="'Play ' + (seat.name ?? 'this seat') + '’s turn for them'" (click)="playFor(d.table, seat.seat)">Play turn</action-button>
                  }
                  @if (seat.player && d.table.status !== "closed" && d.table.status !== "finished") {
                    <action-button variant="outline" size="sm" (click)="unseat(d.table, seat.seat)">Remove</action-button>
                  }
                  @if (seat.player && !seat.blocked) {
                    <action-button variant="ghost" size="sm" (click)="block(seat.player)">Block</action-button>
                  }
                </li>
              }
            </ul>
          </div>

          <div>
            <h3 class="sub">Chat</h3>
            @if (d.chat.length) {
              <ul class="chat" tabindex="0" aria-label="Chat messages">
                @for (line of d.chat; track line.id) {
                  <li [class.notice]="line.notice">
                    <span class="line"
                      ><strong>{{ line.name }}</strong> {{ line.text }}</span
                    >
                    @if (!line.bot && !line.notice) {
                      <action-button variant="ghost" size="sm" [label]="'Remove ' + line.name + '’s message'" (click)="redact(d.table, line)">Remove</action-button>
                    }
                  </li>
                }
              </ul>
            } @else {
              <p class="quiet">Nobody's said anything.</p>
            }
          </div>
        </stack-layout>
      } @else {
        <loading-spinner label="Finding the table" [inline]="true"></loading-spinner>
      }
      <action-button slot="actions" variant="outline" [hidden]="!table() || table()!.status !== 'playing' || !!table()!.paused" (click)="pause()">Pause game</action-button>
      <action-button slot="actions" variant="primary" [hidden]="!table() || !table()!.paused || table()!.status === 'closed'" (click)="resume()">Resume game</action-button>
      <action-button slot="actions" variant="destructive" [hidden]="!table() || table()!.status === 'closed'" (click)="close()">Close this table</action-button>
      <action-button slot="actions" variant="outline" data-close>Done</action-button>
    </modal-dialog>
  `,
})
export class TablePage {
  private readonly admin = inject(Admin);
  private readonly ask = inject(Ask);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly detailOf = detailOf;

  /** The table's id, from the address. */
  readonly id = input.required<string>();
  /** The table and its chat, fetched again for another id. */
  protected readonly detail = resource({ params: () => this.id(), loader: ({ params }) => this.admin.api.table(params) });
  /** The table, once it's here (a resource's value can't be read while it's in error). */
  protected readonly table = computed(() => (this.detail.hasValue() ? this.detail.value().table : null));

  constructor() {
    // When the lists come back from the server, this table may have changed too.
    let first = true;
    effect(() => {
      this.admin.refreshed();
      if (first) return void (first = false);
      untracked(() => this.detail.reload());
    });
  }

  protected label(status: TableStatus): string {
    return STATUS_LABEL[status];
  }

  protected variant(status: TableStatus): string {
    return status === "playing" ? "success" : status === "open" ? "primary" : status === "closed" ? "danger" : "neutral";
  }

  protected leave(): void {
    void this.router.navigate([".."], { relativeTo: this.route, queryParamsHandling: "preserve" });
  }

  protected close(): void {
    const table = this.table();
    if (table) askClose(this.ask, [table], () => this.leave());
  }

  protected pause(): void {
    const table = this.table();
    if (!table) return;
    this.ask.ask({
      title: `Pause ${table.gameName} table ${table.id}?`,
      body: "Nobody can play until you resume. The clock stops too, so nobody runs out of time. Players can still chat, and the table is told why.",
      field: "Reason",
      help: "Everyone at the table sees this.",
      action: "Pause game",
      run: async (reason) => {
        await this.admin.api.pauseTable(table.id, reason);
        return `Paused table ${table.id}.`;
      },
    });
  }

  protected resume(): void {
    const table = this.table();
    if (!table) return;
    void this.run(() => this.admin.api.resumeTable(table.id), `Resumed table ${table.id}.`);
  }

  protected playFor(table: Table, seat: number): void {
    const name = table.seats[seat]?.name ?? `Seat ${seat + 1}`;
    this.ask.ask({
      title: `Play ${name}'s turn for them?`,
      body: "The game's computer player picks the move, and the table is told the host played it. The game stays paused.",
      action: "Play their turn",
      run: async () => {
        await this.admin.api.playFor(table.id, seat);
        return `Played a turn for ${name}.`;
      },
    });
  }

  private async run(go: () => Promise<unknown>, done: string): Promise<void> {
    try {
      await go();
      this.admin.toast(done, "success");
    } catch (error) {
      this.admin.toast(message(error), "danger");
    }
    await this.admin.refresh();
  }

  protected unseat(table: Table, seat: number): void {
    const name = table.seats[seat]?.name ?? `Seat ${seat + 1}`;
    this.ask.ask({
      title: `Remove ${name} from this table?`,
      body: table.started ? "A computer player takes over their seat, so the others can finish the game." : "The seat opens up again for someone else. They could sit back down unless you block them.",
      action: "Remove from table",
      run: async () => {
        await this.admin.api.unseat(table.id, seat);
        return `Removed ${name} from table ${table.id}.`;
      },
    });
  }

  protected block(ref: string | null): void {
    const player = this.admin.players().find((p) => p.ref === ref);
    if (player) askBlock(this.ask, [player]);
  }

  protected async redact(table: Table, line: ChatLine): Promise<void> {
    try {
      await this.admin.api.redact(table.id, line.id);
      this.admin.toast("Removed the message.", "success");
    } catch (error) {
      this.admin.toast(message(error), "danger");
    }
    await this.admin.refresh();
  }
}
