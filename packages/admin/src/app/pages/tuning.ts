// A game's numbers, as the host may change them. The form is built from the game's own shape (sent by
// the server) and filled from what is saved: a number left empty is the game's own. Nothing is sent
// until Save, and the server checks it again; while it is on its way the whole form is disabled.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, inject, signal, type OnInit } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ZubraModel } from "@zubra/runtime/angular";
import { Admin, message, when } from "../admin";
import { ApiError, type TunableGame } from "../api";
import { Ask } from "../ask";
import { AssistantPanel } from "../tuning/assistant";
import { ShapeField } from "../tuning/field";
import { build, firstProblem, read } from "../tuning/shape";
import type { AbstractControl } from "@angular/forms";

/** Where each game publishes its own numbers (a file beside it), so the form can show them as hints. */
const DEFAULTS: Record<string, string> = { "back-room": "../wasm/battler-defaults.json" };

@Component({
  selector: "app-tuning",
  imports: [ReactiveFormsModule, ZubraModel, ShapeField, AssistantPanel],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loadError(); as why) {
      <alert-banner variant="danger" heading="Couldn't load the games' numbers">{{ why }}</alert-banner>
    } @else if (!games().length) {
      <loading-spinner label="Loading"></loading-spinner>
    } @else {
      <p class="quiet">Change a number a game plays by, without a new release. Leave a field empty to keep the game's own. Games read these when they start, so a game already going isn't changed.</p>
      <select-field zubraModel [formControl]="pick" label="Game" [options]="options()"></select-field>
      @if (current(); as game) {
        <p class="quiet" data-testid="saved">
          @if (changed(game)) { Version {{ game.saved.version }}, saved {{ saved(game) }}. } @else { Nothing changed: the game uses its own numbers.{{ game.saved.version ? " (Version " + game.saved.version + ".)" : "" }} }
        </p>
        @if (problems().length) {
          <alert-banner variant="danger" heading="That can't be saved">
            @for (p of problems(); track p) { <div>{{ p }}</div> }
          </alert-banner>
        }
        @if (form(); as f) {
          <form (submit)="save($event)" novalidate [attr.aria-busy]="saving()">
            <app-shape-field [shape]="game.shape" [control]="f" label="" [defaults]="defaults()"></app-shape-field>
            <div class="actions">
              <action-button type="submit" [loading]="saving()" [disabled]="saving() || !f.dirty || f.invalid">Save</action-button>
              <action-button variant="outline" [disabled]="saving() || !f.dirty" (click)="revert()">Undo my changes</action-button>
              <action-button variant="outline" [disabled]="saving() || !changed(game)" (click)="reset(game)">Back to the game's own numbers</action-button>
            </div>
            @if (canPromote()) {
              <div class="actions" data-testid="promote">
                <action-button variant="outline" [disabled]="saving() || f.dirty || !changed(game) || done(game)" (click)="promote(game)">Open a pull request</action-button>
                <span class="quiet">
                  @if (game.promoted?.version === game.saved.version) { Opened for this version: <a [href]="game.promoted!.url" target="_blank" rel="noopener">#{{ game.promoted!.number }}</a>. }
                  @else if (f.dirty) { Save first: the pull request is for what is saved. }
                  @else { Writes the saved numbers into the code, as a draft for review. Nothing is merged. }
                </span>
              </div>
            }
            @if (f.invalid && f.dirty) { <p class="problem" role="alert">{{ trouble() }}</p> }
          </form>
        }
      }
      <app-assistant (applied)="applied($event)"></app-assistant>
    }
  `,
})
export class TuningPage implements OnInit {
  protected readonly admin = inject(Admin);
  private readonly ask = inject(Ask);
  protected readonly games = signal<TunableGame[]>([]);
  protected readonly loadError = signal("");
  protected readonly canPromote = signal(false);
  protected readonly saving = signal(false);
  protected readonly problems = signal<string[]>([]);
  protected readonly pick = new FormControl("", { nonNullable: true });
  private readonly picked = signal("");
  protected readonly form = signal<AbstractControl | null>(null);
  protected readonly defaults = signal<unknown>(undefined);

  protected readonly options = computed(() => this.games().map((g) => ({ value: g.id, label: g.name })));
  protected readonly current = computed(() => this.games().find((g) => g.id === this.picked()) ?? null);
  protected changed = (game: TunableGame) => Object.keys(game.saved.values).length > 0;
  protected saved = (game: TunableGame) => when(game.saved.at);
  protected trouble = () => (this.form() ? firstProblem(this.form()!) : "");

  async ngOnInit(): Promise<void> {
    this.pick.valueChanges.subscribe((id) => void this.show(id));
    try {
      const { games, canPromote } = await this.admin.api.tunables();
      this.canPromote.set(canPromote === true);
      this.games.set(games);
      const first = games[0]?.id ?? "";
      this.pick.setValue(first);
    } catch (error) {
      this.loadError.set(message(error));
    }
  }

  /** The form for a game, filled from what is saved. */
  private async show(id: string): Promise<void> {
    this.picked.set(id);
    this.problems.set([]);
    const game = this.games().find((g) => g.id === id);
    this.form.set(game ? build(game.shape, game.saved.values) : null);
    this.defaults.set(undefined);
    const url = DEFAULTS[id];
    if (url) {
      try {
        const response = await fetch(new URL(url, document.baseURI), { cache: "no-store" });
        if (response.ok && this.picked() === id) this.defaults.set(await response.json());
      } catch {
        /* the hints are a convenience */
      }
    }
  }

  protected revert(): void {
    void this.show(this.picked());
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const game = this.current();
    const form = this.form();
    if (!game || !form || this.saving()) return;
    form.markAllAsTouched();
    if (form.invalid) return;
    this.problems.set([]);
    this.saving.set(true);
    form.disable({ emitEvent: false });
    try {
      const saved = await this.admin.api.setTunables(game.id, read(game.shape, form) ?? {});
      this.games.update((all) => all.map((g) => (g.id === game.id ? { ...g, saved } : g)));
      this.admin.toast(`${game.name}: version ${saved.version} is saved.`, "success");
      await this.show(game.id);
    } catch (error) {
      form.enable({ emitEvent: false });
      this.problems.set(error instanceof ApiError && error.status === 422 ? [error.message] : []);
      this.admin.toast(message(error), "danger");
    } finally {
      this.saving.set(false);
    }
  }

  /** The assistant saved some numbers as a game's live override. */
  protected applied({ game, saved }: { game: string; saved: TunableGame["saved"] }): void {
    this.games.update((all) => all.map((g) => (g.id === game ? { ...g, saved } : g)));
    if (this.picked() === game) void this.show(game);
  }

  protected done = (game: TunableGame) => game.promoted?.version === game.saved.version;

  protected promote(game: TunableGame): void {
    this.ask.ask({
      title: `Open a pull request for ${game.name}?`,
      body: `The numbers saved as version ${game.saved.version} are written into the code on a new branch, and a draft pull request is opened for review. Nothing is merged, and the live numbers don't change.`,
      action: "Open the pull request",
      run: async () => {
        const made = await this.admin.api.promoteTunables(game.id);
        this.games.update((all) => all.map((g) => (g.id === game.id ? { ...g, promoted: made } : g)));
        return `Pull request #${made.number} is open for ${game.name}.`;
      },
    });
  }

  protected reset(game: TunableGame): void {
    this.ask.ask({
      title: `Put ${game.name} back?`,
      body: `${game.name} goes back to its own numbers. A run already going keeps the numbers it started on.`,
      action: "Put them back",
      run: async () => {
        const saved = await this.admin.api.resetTunables(game.id);
        this.games.update((all) => all.map((g) => (g.id === game.id ? { ...g, saved } : g)));
        await this.show(game.id);
        return `${game.name} is back to its own numbers.`;
      },
    });
  }
}
