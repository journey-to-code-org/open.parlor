// Angular's own features around Zubra components: @for with track, dependency injection, class and
// style bindings, @defer, animate.leave, reactive and template-driven forms and content projection. The checks are in
// tests/features.spec.ts.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, Injectable, inject, input, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { ZubraModel } from "@zubra/runtime/angular";
import { FACES, SEGMENTS, WORDS } from "../../src/shared/fixture";
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
  imports: [ReactiveFormsModule, FormsModule, ZubraModel, WordText, Panel, Lazy],
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
        <h2>A reactive form of the parlor's other controls</h2>
        <form [formGroup]="all">
          <select-field data-t="f-all-seat" label="Seat" [options]="SEGMENTS" formControlName="seat" zubraModel></select-field>
          <segmented-control data-t="f-all-view" label="View" [options]="SEGMENTS" formControlName="view" zubraModel></segmented-control>
          <color-swatches data-t="f-all-colour" formControlName="colour" zubraModel></color-swatches>
        </form>
        <output data-t="f-all-out">{{ allJson() }}</output>
        <button data-t="f-all-set" type="button" (click)="all.setValue({ seat: 'c', view: 'b', colour: '#db2777' })">Set them</button>
        <button data-t="f-all-disable" type="button" (click)="all.disabled ? all.enable() : all.disable()">Disable / enable</button>
      </section>

      <section>
        <h2>A template-driven form</h2>
        <form #td="ngForm" data-t="f-td">
          <text-field data-t="f-td-name" label="Nickname" name="nick" [(ngModel)]="nick" [disabled]="tdOff" required zubraModel></text-field>
          <toggle-switch data-t="f-td-chime" label="Chime" name="chime" [(ngModel)]="chime" [disabled]="tdOff" zubraModel="checked"></toggle-switch>
        </form>
        <output data-t="f-td-out">{{ td.valid ? "valid" : "invalid" }} {{ nick }} {{ chime }}</output>
        <button data-t="f-td-set" type="button" (click)="nick = 'Hank'; chime = true">Set Hank</button>
        <button data-t="f-td-disable" type="button" (click)="tdOff = !tdOff">Disable / enable</button>
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
  // The template-driven form's model: plain fields, bound with [(ngModel)].
  protected nick = "";
  protected chime = false;
  protected tdOff = false;
  protected readonly WORDS = WORDS;
  protected readonly SEGMENTS = SEGMENTS;
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

  /** The parlor's other two-way controls: a select, a segmented control, swatches. (The slider is
   *  left for lazy.ts, which needs a component the page hasn't loaded.) */
  protected readonly all = new FormGroup({
    seat: new FormControl("a", { nonNullable: true }),
    view: new FormControl("a", { nonNullable: true }),
    colour: new FormControl("#16a34a", { nonNullable: true }),
  });
  private readonly allNews = toSignal(this.all.events);

  protected allJson(): string {
    this.allNews();
    return JSON.stringify(this.all.getRawValue());
  }

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
