// Everything the admin has done, newest first.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { Admin, when } from "../admin";

@Component({
  selector: "app-activity",
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (admin.log().length) {
      <data-table label="Activity" [columns]="columns" [rows]="rows()" [pageSize]="20"></data-table>
    } @else {
      <empty-state heading="Nothing yet">Closing a table, removing or blocking a player and hiding a design are all written down here.</empty-state>
    }
  `,
})
export class ActivityPage {
  protected readonly admin = inject(Admin);
  protected readonly columns = [
    { key: "when", label: "When" },
    { key: "action", label: "What", sortable: true },
    { key: "target", label: "To", sortable: true },
    { key: "note", label: "Note" },
  ];
  protected readonly rows = computed(() => this.admin.log().map((e) => ({ id: e.id, when: when(e.at), action: e.action, target: e.target, note: e.note })));
}
