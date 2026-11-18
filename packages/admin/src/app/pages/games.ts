// The games on the parlor's front page, and whether tables with players can be watched. A reactive
// form: one switch a game (a FormRecord, by game id) and one for watching. Each change is sent at
// once; while it's on its way the whole form is disabled, switches and all, so two changes can't
// cross on the way to the server.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, FormRecord, ReactiveFormsModule } from "@angular/forms";
import { ZubraModel } from "@zubra/runtime/angular";
import { Admin, message } from "../admin";
import type { Catalogue, CatalogueGame } from "../api";

@Component({
  selector: "app-games",
  imports: [ReactiveFormsModule, ZubraModel],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (admin.catalogue(); as c) {
      <div class="setting">
        <toggle-switch
          zubraModel="checked"
          [formControl]="form.controls.watching"
          label="Let people watch tables with players"
          description="Watchers see the cards on the table and the score, never anyone's hand. Tables of computer players can always be watched."
        ></toggle-switch>
      </div>
      <h2 class="sub">Games on the front page</h2>
      <p class="quiet">Switch a game off to stop new tables of it; tables already going carry on. The order here is the order everyone sees.</p>
      <ol class="games" [attr.aria-busy]="admin.savingGames()">
        @for (game of c.games; track game.id; let i = $index; let last = $last) {
          <li [class.off]="!game.on">
            <span class="place">{{ i + 1 }}</span>
            <span class="emoji" aria-hidden="true">{{ game.emoji }}</span>
            <!-- The switch is the row's name too: its label and description. -->
            @if (control(game.id); as on) {
              <toggle-switch zubraModel="checked" [formControl]="on" [label]="game.name" [description]="seats(game)"></toggle-switch>
            }
            <span class="moves">
              <action-button variant="ghost" size="sm" [disabled]="i === 0 || admin.savingGames()" [label]="'Move ' + game.name + ' to the top'" (click)="move(game, 0)">Top</action-button>
              <action-button variant="outline" size="sm" [disabled]="i === 0 || admin.savingGames()" [label]="'Move ' + game.name + ' up'" (click)="move(game, i - 1)">↑</action-button>
              <action-button variant="outline" size="sm" [disabled]="last || admin.savingGames()" [label]="'Move ' + game.name + ' down'" (click)="move(game, i + 1)">↓</action-button>
            </span>
          </li>
        }
      </ol>
    }
  `,
})
export class GamesPage {
  protected readonly admin = inject(Admin);
  private readonly destroyed = inject(DestroyRef);
  protected readonly form = new FormGroup({
    watching: new FormControl(false, { nonNullable: true }),
    games: new FormRecord<FormControl<boolean>>({}),
  });

  constructor() {
    // The form follows the catalogue: as the server last told it, or as a change is being sent.
    effect(() => {
      const catalogue = this.admin.catalogue();
      if (!catalogue) return;
      this.form.controls.watching.setValue(catalogue.watching, { emitEvent: false });
      for (const game of catalogue.games) {
        const control = this.control(game.id);
        if (control) {
          control.setValue(game.on, { emitEvent: false });
          continue;
        }
        const made = new FormControl(game.on, { nonNullable: true });
        this.form.controls.games.addControl(game.id, made, { emitEvent: false });
        made.valueChanges.pipe(takeUntilDestroyed(this.destroyed)).subscribe((on) => this.setOn(game.id, on));
      }
      if (this.admin.savingGames()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
    this.form.controls.watching.valueChanges.pipe(takeUntilDestroyed()).subscribe((watching) => {
      const now = this.admin.catalogue();
      if (now) void this.save({ ...now, watching }, { watching });
    });
  }

  protected control(id: string): FormControl<boolean> | undefined {
    return this.form.controls.games.controls[id];
  }

  protected seats(game: CatalogueGame): string {
    const [min, max] = game.seats;
    return `${min === max ? min : `${min} to ${max}`} ${max === 1 ? "player" : "players"}${game.teams ? ", partners" : ""}`;
  }

  private setOn(id: string, on: boolean): void {
    const now = this.admin.catalogue();
    if (!now) return;
    const games = now.games.map((g) => (g.id === id ? { ...g, on } : g));
    void this.save({ ...now, games }, { off: games.filter((g) => !g.on).map((g) => g.id) });
  }

  /** Move a game to a place in the list (0 is first). */
  protected move(game: CatalogueGame, to: number): void {
    const now = this.admin.catalogue();
    if (!now || this.admin.savingGames()) return;
    const games = now.games.filter((g) => g.id !== game.id);
    games.splice(Math.max(0, Math.min(to, games.length)), 0, game);
    void this.save({ ...now, games }, { order: games.map((g) => g.id) });
  }

  /** Show the change at once, send it, and take the server's word for how it ended up. */
  private async save(next: Catalogue, change: { order?: string[]; off?: string[]; watching?: boolean }): Promise<void> {
    const before = this.admin.catalogue();
    this.admin.catalogue.set(next);
    this.admin.savingGames.set(true);
    try {
      this.admin.catalogue.set(await this.admin.api.setGames(change));
    } catch (error) {
      this.admin.catalogue.set(before);
      this.admin.toast(message(error), "danger");
    } finally {
      this.admin.savingGames.set(false);
    }
  }
}
