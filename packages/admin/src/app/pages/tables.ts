// Every table: filter them by how they're going (?show=, so a filtered list has an address too),
// tick some to close, or open one (tables/<id>, a dialog over this list).
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterOutlet } from "@angular/router";
import { ZubraModel } from "@zubra/runtime/angular";
import { Admin, STATUS_LABEL, detailOf, people } from "../admin";
import type { Table, TableStatus } from "../api";
import { Ask } from "../ask";

type Show = "all" | TableStatus;
const SHOWS: Show[] = ["all", "playing", "open", "finished", "closed"];

/** Ask, then close some tables. Used from the list and from one table's dialog. */
export function askClose(ask: Ask, tables: Table[], after: () => void = () => {}): void {
  if (!tables.length) return;
  const one = tables.length === 1 ? tables[0]! : null;
  ask.ask({
    title: one ? `Close ${one.gameName} table ${one.id}?` : `Close ${tables.length} tables?`,
    body: one ? `${people(one)}. Nobody will be able to sit, play or talk there again. This can't be undone.` : "Nobody will be able to sit, play or talk at them again. This can't be undone.",
    field: "Reason",
    help: "Everyone at the table sees this.",
    action: one ? "Close table" : `Close ${tables.length} tables`,
    run: async (reason) => {
      for (const t of tables) await ask.admin.api.closeTable(t.id, reason);
      after();
      return one ? `Closed table ${one.id}.` : `Closed ${tables.length} tables.`;
    },
  });
}

@Component({
  selector: "app-tables",
  imports: [ReactiveFormsModule, ZubraModel, RouterOutlet],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <segmented-control zubraModel [formControl]="show" [options]="filters" label="Show tables"></segmented-control>
      <cluster-layout gap="0.5rem" justify="flex-end">
        <action-button variant="outline" size="sm" [disabled]="picked().length !== 1" (click)="look(picked()[0])">Look at table</action-button>
        <action-button variant="destructive" size="sm" [disabled]="!closable().length" (click)="close(closable())">
          {{ closable().length > 1 ? "Close " + closable().length + " tables" : "Close table" }}
        </action-button>
      </cluster-layout>
    </div>
    @if (admin.tables().length) {
      <data-table label="Tables" [columns]="columns" [rows]="rows()" [selectable]="true" [pageSize]="12" [selected]="picked()" (selectedchange)="picked.set(detailOf($event))"></data-table>
      <p class="quiet hint">Tick a table to look at who's there and what's been said, or to close it.</p>
    } @else {
      <empty-state heading="No tables yet">
        When someone opens a table in the parlor, it shows up here.
        <action-button slot="actions" variant="outline" href="../" target="_blank">Open the parlor</action-button>
      </empty-state>
    }
    <router-outlet />
  `,
})
export class TablesPage {
  protected readonly admin = inject(Admin);
  private readonly ask = inject(Ask);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly detailOf = detailOf;

  /** ?show=: which tables, from the address. */
  readonly showing = input<string | undefined>(undefined, { alias: "show" });
  /** What's shown: the address is the one place it's kept. */
  private readonly shown = computed<Show>(() => (SHOWS.includes(this.showing() as Show) ? (this.showing() as Show) : "all"));
  protected readonly show = new FormControl<Show>("all", { nonNullable: true });
  protected readonly filters = [
    { value: "all", label: "All" },
    { value: "playing", label: "Playing" },
    { value: "open", label: "Waiting" },
    { value: "finished", label: "Finished" },
    { value: "closed", label: "Closed" },
  ];
  protected readonly columns = [
    { key: "code", label: "Table", sortable: true },
    { key: "game", label: "Game", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "people", label: "At the table" },
    { key: "house", label: "House", sortable: true },
    { key: "messages", label: "Chat", sortable: true, format: "number" },
  ];
  protected readonly rows = computed(() =>
    this.admin
      .tables()
      .filter((t) => this.shown() === "all" || t.status === this.shown())
      .map((t) => ({
        id: t.id,
        code: t.label ? `${t.id} · ${t.label}` : t.id,
        game: t.rules ? `${t.gameName} (${t.rules})` : t.gameName,
        status: STATUS_LABEL[t.status],
        people: people(t),
        house: t.house?.name ?? "",
        messages: t.messages,
      })),
  );
  protected readonly picked = signal<string[]>([]);
  protected readonly closable = computed(() => this.admin.tables().filter((t) => this.picked().includes(t.id) && t.status !== "closed"));

  constructor() {
    // The address says what to show (a link, Back); the control says it back to the address.
    effect(() => {
      const show = this.shown();
      if (show !== this.show.value) this.show.setValue(show, { emitEvent: false });
    });
    this.show.valueChanges.pipe(takeUntilDestroyed()).subscribe((show) => void this.router.navigate([], { relativeTo: this.route, queryParams: { show: show === "all" ? null : show }, queryParamsHandling: "merge" }));
    // A selection only makes sense for rows that are still there.
    effect(() => {
      const ids = new Set(this.admin.tables().map((t) => t.id));
      this.picked.update((picked) => (picked.every((id) => ids.has(id)) ? picked : picked.filter((id) => ids.has(id))));
    });
  }

  protected look(id: string | undefined): void {
    if (id) void this.router.navigate([id], { relativeTo: this.route, queryParamsHandling: "preserve" });
  }

  protected close(tables: Table[]): void {
    askClose(this.ask, tables, () => this.picked.set([]));
  }
}
