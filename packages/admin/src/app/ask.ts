// "Are you sure?": the one question every page asks before something that can't be taken back,
// sometimes with a reason to give or a new name to type. A page calls `ask()`; the shell draws the
// dialog. The field is a reactive form control, checked as it's typed in: a house needs a name,
// and nothing is longer than the server keeps.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { ZubraModel } from "@zubra/runtime/angular";
import { Admin, detailOf } from "./admin";

export interface Question {
  title: string;
  body: string;
  /** The field's label (a reason, or a new name); without one, nothing is asked for. */
  field?: string;
  /** What the field starts with. */
  initial?: string;
  /** Who'll read what's typed. */
  help?: string;
  /** Something must be typed (a new name); a reason can be left empty. */
  required?: boolean;
  /** The most it may be: what the server keeps (200 if not said). */
  max?: number;
  action: string;
  /** Do it; what to tell the admin afterwards. */
  run(text: string): Promise<string>;
}

@Injectable({ providedIn: "root" })
export class Ask {
  readonly admin = inject(Admin);
  readonly question = signal<Question | null>(null);
  readonly open = signal(false);
  readonly busy = signal(false);
  /** The reason or the name. Its rules are set by each question. */
  readonly text = new FormControl("", { nonNullable: true });

  constructor() {
    effect(() => this.admin.paused.set(this.open()));
  }

  ask(question: Question): void {
    this.text.setValidators([...(question.required ? [Validators.required, Validators.pattern(/\S/)] : []), Validators.maxLength(question.max ?? 200)]);
    this.text.reset(question.initial ?? "");
    this.question.set(question);
    this.open.set(true);
  }

  async answer(): Promise<void> {
    const question = this.question();
    if (!question || this.busy()) return;
    if (this.text.invalid) return this.text.markAsTouched();
    this.busy.set(true);
    try {
      const done = await question.run(this.text.value.trim());
      this.open.set(false);
      this.admin.toast(done, "success");
    } catch (error) {
      this.admin.toast(error instanceof Error ? error.message : "Something went wrong. Try again.", "danger");
    } finally {
      this.busy.set(false);
    }
    await this.admin.refresh();
  }
}

@Component({
  selector: "app-ask",
  imports: [ReactiveFormsModule, ZubraModel],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <modal-dialog [open]="ask.open()" (openchange)="ask.open.set(detailOf($event))" [label]="ask.question()?.title ?? 'Are you sure?'">
      @if (ask.question(); as q) {
        <form (submit)="$event.preventDefault(); ask.answer()" novalidate>
          <stack-layout gap="1rem">
            <p class="ask">{{ q.body }}</p>
            @if (q.field) {
              <text-field zubraModel [formControl]="ask.text" [label]="q.field" [description]="q.help ?? ''" [required]="!!q.required" [error]="problem()"></text-field>
            }
          </stack-layout>
        </form>
        <action-button slot="actions" variant="outline" data-close>Cancel</action-button>
        <action-button slot="actions" variant="destructive" [loading]="ask.busy()" [disabled]="invalid()" (click)="ask.answer()">{{ q.action }}</action-button>
      }
    </modal-dialog>
  `,
})
export class AskDialog {
  protected readonly ask = inject(Ask);
  protected readonly detailOf = detailOf;
  private readonly status = toSignal(this.ask.text.statusChanges, { initialValue: this.ask.text.status });
  private readonly value = toSignal(this.ask.text.valueChanges, { initialValue: this.ask.text.value });
  protected readonly invalid = computed(() => (this.ask.question(), this.status() === "INVALID"));
  /** What's wrong with what's typed, once there's something to say. */
  protected readonly problem = computed(() => {
    const q = this.ask.question();
    this.value();
    const errors = this.status() === "INVALID" ? this.ask.text.errors : null;
    if (!q || !errors) return "";
    if (errors["required"] || errors["pattern"]) return `Give it a ${q.field?.toLowerCase() ?? "name"}.`;
    if (errors["maxlength"]) return `That's ${this.ask.text.value.length} characters: ${q.max ?? 200} at most.`;
    return "";
  });
}
