// Playing a run back. A Back Room run is its seed, the numbers it was played on and every command given,
// and the game is deterministic, so a run code (the page's "Copy run code") is enough to see it again:
// what was dealt, what was played, where it went wrong. The replay is done here by the game's own rules
// (inspect/back-room.ts), and nothing is sent anywhere: the code is read and played in this tab.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormControl, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from "@angular/forms";
import { ZubraModel } from "@zubra/runtime/angular";
import { Admin } from "../admin";
import { DEFAULT_TABLES, decode, inspect, tune, type Inspection, type RunRecord, type Tables, type Tunables } from "../inspect/back-room";

const hex = (n: number) => n.toString(16).padStart(8, "0");

/** The run in the text, or what is wrong with it, as a form error. */
function runCode(control: AbstractControl): ValidationErrors | null {
  const text = String(control.value ?? "").trim();
  if (!text) return null;
  const out = decode(text);
  return "problem" in out ? { run: out.problem } : null;
}

@Component({
  selector: "app-inspector",
  imports: [ReactiveFormsModule, ZubraModel],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="quiet">Play a Back Room run back, a move at a time. On a run's page, <em>Copy run code</em> gives the text to paste here. It is read in this tab and not sent anywhere.</p>
    <form (submit)="show($event)" novalidate class="inspect-form">
      <text-field zubraModel [formControl]="code" label="Run code" placeholder="bkr1.…" [required]="true" [error]="shownError()"></text-field>
      <div class="actions">
        <action-button type="submit" [loading]="working()" [disabled]="working() || code.invalid || !code.value.trim()">Play it back</action-button>
        <action-button variant="outline" [disabled]="working() || !code.value" (click)="clear()">Clear</action-button>
      </div>
    </form>

    @if (problem(); as why) {
      <alert-banner variant="danger" heading="Couldn't play that back">{{ why }}</alert-banner>
    }
    @if (note(); as why) {
      <alert-banner variant="warning" heading="Not the numbers it was played on">{{ why }}</alert-banner>
    }

    @if (seen(); as run) {
      <auto-grid min="9rem" class="stats">
        <stat-card label="Seed" [value]="record()!.seed" data-testid="seed"></stat-card>
        <stat-card label="Numbers version" [value]="record()!.numbers" data-testid="numbers"></stat-card>
        <stat-card label="Moves" [value]="record()!.commands.length"></stat-card>
        <stat-card label="Ended" [value]="run.phase" data-testid="phase"></stat-card>
        <stat-card label="State hash" [value]="hash(run.hash)" data-testid="hash"></stat-card>
      </auto-grid>
      @if (run.refused >= 0) {
        <alert-banner variant="danger" heading="The game wouldn't take move {{ run.refused + 1 }}" data-testid="refused">
          “{{ run.steps[run.refused + 1]!.says }}” was refused ({{ run.steps[run.refused + 1]!.why }}). A run the game made can't contain that, so this code was changed, or was played on other numbers. The replay stops there.
        </alert-banner>
      }

      <div class="actions steps" role="group" aria-label="Step through the run">
        <action-button variant="outline" [disabled]="at() === 0" (click)="go(0)">Start</action-button>
        <action-button variant="outline" [disabled]="at() === 0" (click)="go(at() - 1)">Back</action-button>
        <span class="quiet" data-testid="where">Move {{ at() }} of {{ run.steps.length - 1 }}</span>
        <action-button variant="outline" [disabled]="at() >= run.steps.length - 1" (click)="go(at() + 1)">Next</action-button>
        <action-button variant="outline" [disabled]="at() >= run.steps.length - 1" (click)="go(run.steps.length - 1)">End</action-button>
      </div>

      @if (step(); as s) {
        <content-card heading="{{ s.says }}" data-testid="step">
          <p class="quiet">{{ s.floorName }}, turn {{ s.turn }}. Hash {{ hash(s.hash) }}.</p>
          <p>Patience {{ s.hp }} of {{ s.maxHp }} · block {{ s.block }} · energy {{ s.energy }}</p>
          <p><strong>In hand:</strong> {{ s.hand.length ? s.hand.join(", ") : "nothing" }}</p>
          <p><strong>Foes:</strong> {{ foes(s) }}</p>
          @if (s.news.length) {
            <ul>@for (line of s.news; track $index) { <li>{{ line }}</li> }</ul>
          }
        </content-card>
      }
      <data-table label="Every move" [columns]="columns" [rows]="rows()" [pageSize]="15"></data-table>
    }
  `,
})
export class InspectorPage {
  private readonly admin = inject(Admin);
  protected readonly code = new FormControl("", { nonNullable: true, validators: [Validators.maxLength(60_000), runCode] });
  protected readonly working = signal(false);
  protected readonly problem = signal("");
  protected readonly note = signal("");
  protected readonly record = signal<RunRecord | null>(null);
  protected readonly seen = signal<Inspection | null>(null);
  protected readonly at = signal(0);
  protected readonly step = computed(() => this.seen()?.steps[this.at()] ?? null);
  protected readonly hash = hex;
  protected readonly columns = [
    { key: "n", label: "#" },
    { key: "says", label: "Move" },
    { key: "state", label: "After it" },
    { key: "hash", label: "Hash" },
  ];
  protected readonly rows = computed(() =>
    (this.seen()?.steps ?? []).map((s) => ({ id: String(s.n), n: s.n, says: s.ok ? s.says : `${s.says} (refused: ${s.why})`, state: `${s.floorName} · patience ${s.hp} · ${s.phase}`, hash: hex(s.hash) })),
  );

  /** The code's own error, once it has been touched. */
  protected shownError(): string {
    const e = this.code.errors;
    if (!e || !(this.code.touched || this.code.dirty)) return "";
    return e["run"] ?? (e["maxlength"] ? "That is too long to be a run." : "");
  }

  protected foes = (s: { foes: { name: string; hp: number }[] }) => (s.foes.length ? s.foes.map((f) => `${f.name} (${f.hp})`).join(", ") : "none left");
  protected go = (n: number) => this.at.set(n);

  protected clear(): void {
    this.code.reset("");
    this.problem.set("");
    this.note.set("");
    this.record.set(null);
    this.seen.set(null);
    this.at.set(0);
  }

  /** The numbers a run says it was played on: the game's own, or the host's saved ones if they are still these. */
  private async tablesFor(record: RunRecord): Promise<{ tables: Tables; note: string }> {
    if (record.numbers === 0) return { tables: DEFAULT_TABLES, note: "" };
    let saved: { version?: number; values?: Tunables } | null = null;
    try {
      const answer = await fetch(new URL("../tunables/back-room", document.baseURI), { cache: "no-store" });
      saved = answer.ok ? ((await answer.json()) as { version?: number; values?: Tunables }) : null;
    } catch {
      saved = null;
    }
    if (saved && saved.version === record.numbers && saved.values) return { tables: tune(saved.values, saved.version), note: "" };
    const now = saved?.version ?? 0;
    return {
      tables: saved?.values ? tune(saved.values, saved.version ?? 0) : DEFAULT_TABLES,
      note: `This run was played on version ${record.numbers} of the host's numbers, and the parlor now has version ${now} (the parlor keeps only the latest). It is played back on ${now ? `version ${now}` : "the game's own numbers"}, so it may not match what the player saw.`,
    };
  }

  protected async show(event: Event): Promise<void> {
    event.preventDefault();
    this.code.markAsTouched();
    if (this.code.invalid || this.working() || !this.code.value.trim()) return;
    this.working.set(true);
    this.problem.set("");
    this.note.set("");
    try {
      const out = decode(this.code.value);
      if ("problem" in out) {
        this.problem.set(out.problem);
        return;
      }
      const { tables, note } = await this.tablesFor(out.record);
      const seen = inspect(out.record, tables);
      this.record.set(out.record);
      this.seen.set(seen);
      this.note.set(note);
      this.at.set(seen.refused >= 0 ? seen.refused : 0);
    } catch {
      this.problem.set("That run couldn't be played back.");
    } finally {
      this.working.set(false);
    }
  }
}
