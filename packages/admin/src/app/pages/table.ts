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
          </cluster-layout>
          @if (d.table.closed) {
            <alert-banner variant="warning" heading="Closed">{{ d.table.closed }}</alert-banner>
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
                @for (line of d.chat; track line.key) {
                  <li [class.gone]="line.removed">
                    <span class="line"
                      ><strong>{{ line.name }}</strong> {{ line.text }}</span
                    >
                    @if (!line.removed && !line.bot) {
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
      await this.admin.api.redact(table.id, line.key);
      this.admin.toast("Removed the message.", "success");
    } catch (error) {
      this.admin.toast(message(error), "danger");
    }
    await this.admin.refresh();
  }
}
