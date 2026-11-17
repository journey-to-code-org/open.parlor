// Angular's own features around Zubra components: @for with track, dependency injection, class and
// style bindings, @defer, animate.leave, reactive forms and content projection. The checks are in
// tests/features.spec.ts.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, Injectable, inject, input, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ZubraModel } from "@zubra/runtime/angular";
import { FACES, WORDS } from "../../src/shared/fixture";
import { Lazy } from "./lazy";
import "./zubra";

/** The page's word, for whatever the page puts in a slot. */
@Injectable()
export class Word {
  readonly word = signal<string>(WORDS[0]);
}

/** The page's own component, put in a Zubra component's slot: it is given the page's Word. */
@Component({
  selector: "app-word",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span data-t="f-ctx">{{ words.word() }}</span>`,
})
export class WordText {
  protected readonly words = inject(Word);
}

/** The page's own wrapper around a Zubra component: what it is given goes on to the slots. */
@Component({
  selector: "app-panel",
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <empty-state [heading]="heading()">
      <ng-content />
      <ng-content select="[slot=actions]" />
    </empty-state>
  `,
})
export class Panel {
  readonly heading = input("");
}

@Component({
  selector: "app-features",
  imports: [ReactiveFormsModule, ZubraModel, WordText, Panel, Lazy],
  providers: [Word],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main data-t="f-features">
      <section>
        <h2>A keyed list, reordered (&#64;for with track)</h2>
        <stack-layout data-t="f-order" gap="0.25rem">
          @for (face of faces(); track face) {
            <status-badge [attr.data-f-item]="face">{{ face }}</status-badge>
          }
        </stack-layout>
        <button data-t="f-reverse" type="button" (click)="faces.set(faces().slice().reverse())">Reverse</button>
      </section>

      <section>
        <h2>Dependency injection through a slot</h2>
        <empty-state data-t="f-ctx-home" heading="Context"><app-word /></empty-state>
        <button data-t="f-ctx-set" type="button" (click)="words.word.set(WORDS[1])">Change the word</button>
      </section>

      <section>
        <h2>Class and style bindings</h2>
        <status-badge data-t="f-styled" [class.f-hot]="hot()" [style.opacity]="hot() ? 0.5 : 1">Styled</status-badge>
        <button data-t="f-style-toggle" type="button" (click)="hot.set(!hot())">Toggle</button>
      </section>

      <section>
        <h2>Loaded later (&#64;defer)</h2>
        @defer (when wanted()) {
          <app-lazy />
        } @placeholder {
          <span data-t="f-lazy-wait">Waiting</span>
        }
        <button data-t="f-lazy-load" type="button" (click)="wanted.set(true)">Load</button>
      </section>

      <section>
        <h2>Leaving with a transition (animate.leave)</h2>
        @if (fading()) {
          <status-badge data-t="f-fade" animate.leave="f-leave" (animationend)="left.set(left() + 1)">Fading</status-badge>
        }
        <output data-t="f-fade-out">{{ left() }}</output>
        <button data-t="f-fade-toggle" type="button" (click)="fading.set(!fading())">Toggle</button>
      </section>

      <section>
        <h2>A reactive form</h2>
        <form [formGroup]="form">
          <text-field data-t="f-form-name" label="Name" formControlName="name" zubraModel></text-field>
          <toggle-switch data-t="f-form-sound" label="Sound" formControlName="sound" zubraModel="checked"></toggle-switch>
        </form>
        <output data-t="f-form-out">{{ json() }}</output>
        <output data-t="f-form-state">{{ state() }}</output>
        <button data-t="f-form-set" type="button" (click)="form.setValue({ name: 'Hank', sound: false })">Set Hank</button>
        <button data-t="f-form-disable" type="button" (click)="form.disabled ? form.enable() : form.disable()">Disable / enable</button>
        <button data-t="f-form-reset" type="button" (click)="form.reset()">Reset</button>
      </section>

      <section>
        <h2>Content projection</h2>
        <app-panel data-t="f-proj" heading="Projected">
          <span>Inner text</span>
          <action-button slot="actions" data-t="f-proj-action" (click)="presses.set(presses() + 1)">Go</action-button>
        </app-panel>
        <output data-t="f-proj-out">{{ presses() }}</output>
      </section>
    </main>
  `,
})
export class Features {
  protected readonly WORDS = WORDS;
  protected readonly words = inject(Word);

  protected readonly faces = signal([...FACES]);
  protected readonly hot = signal(false);
  protected readonly wanted = signal(false);
  protected readonly fading = signal(true);
  protected readonly left = signal(0);
  protected readonly presses = signal(0);

  protected readonly form = new FormGroup({
    name: new FormControl("", { nonNullable: true, validators: [Validators.required] }),
    sound: new FormControl(false, { nonNullable: true }),
  });
  /** Anything the form reports: a value, validity, touched or pristine. */
  private readonly news = toSignal(this.form.events);

  protected json(): string {
    this.news();
    return JSON.stringify(this.form.getRawValue());
  }

  protected state(): string {
    this.news();
    const name = this.form.controls.name;
    return [name.valid ? "valid" : "invalid", name.touched ? "touched" : "untouched", name.dirty ? "dirty" : "pristine"].join(" ");
  }
}
