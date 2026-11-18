// The parlor at a glance: what's going on, the latest of what the admin did, and backups.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { Admin, message, when } from "../admin";

@Component({
  selector: "app-overview",
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (admin.overview(); as o) {
      <auto-grid min="11rem" gap="0.9rem">
        <stat-card label="Playing now" [value]="o.tables.playing" period="tables with a game going"></stat-card>
        <stat-card label="Waiting for players" [value]="o.tables.open" period="tables not dealt yet"></stat-card>
        <stat-card label="Players" [value]="o.players" period="everyone who's sat down here"></stat-card>
        <stat-card label="Blocked" [value]="o.blocked" period="players you've blocked"></stat-card>
        <stat-card label="Houses" [value]="o.houses" period="family groups"></stat-card>
        <stat-card label="Shared designs" [value]="o.designs.shared" [period]="o.designs.hidden ? o.designs.hidden + ' hidden by you' : 'card decks in the gallery'"></stat-card>
        @if (o.bots; as b) {
          <stat-card label="Bot thinks" [value]="b.thinks" [period]="b.workers + (b.workers === 1 ? ' worker' : ' workers') + ', ' + (b.queued + b.running) + ' thinking now · ' + b.averageMs + ' ms usual, ' + b.worstMs + ' ms worst · ' + b.abandoned + ' given up on'"></stat-card>
        }
      </auto-grid>
      <h2 class="sub">Latest activity</h2>
      @if (admin.log().length) {
        <ul class="feed">
          @for (entry of admin.log().slice(0, 5); track entry.id) {
            <li>
              <strong>{{ entry.action }}</strong>
              <span>{{ entry.target }}</span>
              <small>{{ when(entry.at) }}</small>
            </li>
          }
        </ul>
      } @else {
        <p class="quiet">Nothing yet. Whatever you do here (closing a table, blocking a player, hiding a design) is written down under Activity.</p>
      }
      <h2 class="sub">Backups</h2>
      @if (o.backups; as b) {
        <p class="quiet" data-backups>
          @if (b.latest; as latest) {
            The last copy of the parlor's database was made {{ when(latest.at) }} ({{ size(latest.size) }}).
          } @else {
            No copy of the parlor's database has been made yet.
          }
          The server makes one every {{ b.hours }} hours and keeps the newest {{ b.keep }}, on the same disk as the database.
        </p>
        <action-button variant="outline" [loading]="saving()" (click)="download()">Download a copy now</action-button>
      } @else {
        <p class="quiet" data-backups>Nothing is being backed up: this parlor keeps its tables in memory, or backups are switched off.</p>
      }
    }
  `,
})
export class OverviewPage {
  protected readonly admin = inject(Admin);
  protected readonly when = when;
  protected readonly saving = signal(false);

  protected size(bytes: number): string {
    return bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  /** Take a copy of the database away: the server makes one now and the browser saves it. */
  protected async download(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const { name, file } = await this.admin.api.backup();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
      this.admin.toast(`Saved ${name}. Keep it somewhere that isn't this server.`, "success");
    } catch (error) {
      this.admin.toast(message(error), "danger");
    }
    this.saving.set(false);
    await this.admin.refresh();
  }
}
