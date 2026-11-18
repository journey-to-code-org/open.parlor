// One part of a game's tunables form, drawn from its shape: a number is a text field (empty means "as the
// game has it", with the game's own number as the hint), a table is an entry for each name with a way to
// add one, a list is a row for each item. It draws itself again inside itself for what is inside it.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, input, signal } from "@angular/core";
import { AbstractControl, FormArray, FormControl, FormGroup, FormRecord, ReactiveFormsModule } from "@angular/forms";
import { ZubraModel } from "@zubra/runtime/angular";
import { build, nameCheck, type Shape } from "./shape";

const words = (key: string) => key.replace(/([A-Z])/g, " $1").toLowerCase();

@Component({
  selector: "app-shape-field",
  imports: [ReactiveFormsModule, ZubraModel, ShapeField],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (shape().type) {
      @case ("int") {
        <text-field
          zubraModel
          [formControl]="asControl()"
          [label]="label()"
          inputmode="numeric"
          [placeholder]="hint()"
          [error]="problem()"
        ></text-field>
      }
      @case ("enum") {
        <select-field zubraModel [formControl]="asControl()" [label]="label()" [options]="options()"></select-field>
      }
      @case ("object") {
        <fieldset class="group" [disabled]="control().disabled">
          @if (label()) { <legend>{{ label() }}</legend> }
          <div class="fields">
            @for (key of keys(); track key) {
              <app-shape-field [shape]="fieldShape(key)" [control]="child(key)" [label]="label_(key)" [defaults]="defaultOf(key)"></app-shape-field>
            }
          </div>
          @if (groupProblem(); as why) { <p class="problem" role="alert">{{ why }}</p> }
        </fieldset>
      }
      @case ("record") {
        <fieldset class="group" [disabled]="control().disabled">
          @if (label()) { <legend>{{ label() }}</legend> }
          @for (name of names(); track name) {
            <div class="entry">
              <app-shape-field [shape]="valueShape()" [control]="entry(name)" [label]="entryLabel(name)" [defaults]="defaultOf(name)"></app-shape-field>
              <action-button variant="ghost" size="sm" [label]="'Leave ' + name + ' as the game has it'" [disabled]="control().disabled" (click)="remove(name)">Remove</action-button>
            </div>
          }
          <div class="adder">
            <text-field
              zubraModel
              [formControl]="adding"
              [label]="'Change another ' + noun()"
              [placeholder]="suggestion()"
              [error]="addProblem()"
              (keydown.enter)="add($event)"
            ></text-field>
            <action-button variant="outline" size="sm" [disabled]="control().disabled || adding.invalid || !adding.value" (click)="add($event)">Add</action-button>
          </div>
        </fieldset>
      }
      @case ("list") {
        <fieldset class="group" [disabled]="control().disabled">
          @if (label()) { <legend>{{ label() }}</legend> }
          @for (item of rows(); track item; let i = $index) {
            <div class="entry">
              <app-shape-field [shape]="itemShape()" [control]="item" [label]="rowLabel(i)" [defaults]="defaultAt(i)"></app-shape-field>
              @if (!fixed()) {
                <action-button variant="ghost" size="sm" [label]="'Remove ' + rowLabel(i).toLowerCase()" [disabled]="control().disabled" (click)="removeRow(i)">Remove</action-button>
              }
            </div>
          }
          @if (listProblem(); as why) { <p class="problem" role="alert">{{ why }}</p> }
          @if (!fixed()) {
            <action-button variant="outline" size="sm" [disabled]="control().disabled || rows().length >= listMax()" (click)="addRow()">Add a step</action-button>
          }
        </fieldset>
      }
    }
  `,
})
export class ShapeField {
  readonly shape = input.required<Shape>();
  readonly control = input.required<AbstractControl>();
  readonly label = input("");
  /** What the game itself has here, to show as a hint (and to suggest names from). */
  readonly defaults = input<unknown>(undefined);

  protected readonly adding = new FormControl("", { nonNullable: true });
  protected readonly addProblem = signal("");
  /** Bumped when entries come and go, so the lists below are read again. */
  private readonly changes = signal(0);

  protected asControl = () => this.control() as FormControl<string>;
  protected hint = computed(() => (typeof this.defaults() === "number" ? String(this.defaults()) : ""));
  protected problem = () => {
    const c = this.control();
    return (c.touched || c.dirty) && c.errors ? String(Object.values(c.errors)[0]) : "";
  };
  protected groupProblem = () => (this.control().errors?.["needed"] as string | undefined) ?? "";
  protected listProblem = () => ((this.control().errors?.["length"] ?? this.control().errors?.["partial"]) as string | undefined) ?? "";
  /** A list of one set length (a number for each weekday) has its rows and no way to add or take one away. */
  protected fixed = () => {
    const shape = this.shape();
    return shape.type === "list" && shape.min === shape.max;
  };
  protected rowLabel = (i: number) => (this.label() === "clues" ? (["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i] ?? `Day ${i + 1}`) : `Step ${i + 1}`);
  protected options = computed(() => ((this.shape() as { of?: string[] }).of ?? []).map((value) => ({ value, label: value })));

  protected keys = computed(() => Object.keys((this.shape() as { fields: Record<string, Shape> }).fields));
  protected fieldShape = (key: string) => (this.shape() as { fields: Record<string, Shape> }).fields[key]!;
  protected child = (key: string) => (this.control() as FormGroup).controls[key]!;
  protected label_ = (key: string) => words(key);
  protected defaultOf = (key: string): unknown => {
    const d = this.defaults();
    return typeof d === "object" && d !== null && !Array.isArray(d) ? (d as Record<string, unknown>)[key] : undefined;
  };
  protected defaultAt = (i: number): unknown => (Array.isArray(this.defaults()) ? (this.defaults() as unknown[])[i] : undefined);

  protected valueShape = () => (this.shape() as { value: Shape }).value;
  protected itemShape = () => (this.shape() as { item: Shape }).item;
  protected listMax = () => (this.shape() as { max: number }).max;
  protected noun = () => (this.label() === "foes" ? "foe" : this.label() === "cards" ? "card" : "entry");
  protected names = computed(() => (this.changes(), Object.keys((this.control() as FormRecord).controls)));
  protected rows = computed(() => (this.changes(), [...(this.control() as FormArray).controls]));
  protected entry = (name: string) => (this.control() as FormRecord).controls[name]!;
  protected entryLabel = (name: string) => {
    const d = this.defaultOf(name) as { name?: string } | undefined;
    return d?.name ? `${d.name} (${name})` : name;
  };
  /** A name from the game's own list not yet changed here: what to type. */
  protected suggestion = computed(() => {
    this.changes();
    const d = this.defaults();
    const have = Object.keys((this.control() as FormRecord).controls);
    return typeof d === "object" && d !== null ? (Object.keys(d).find((k) => !have.includes(k)) ?? "") : "";
  });

  constructor() {
    this.adding.valueChanges.subscribe(() => {
      const shape = this.shape();
      if (shape.type !== "record") return;
      const name = this.adding.value;
      const problem = name ? nameCheck(shape.key, () => Object.keys((this.control() as FormRecord).controls))(this.adding) : null;
      this.addProblem.set(problem ? String(Object.values(problem)[0]) : "");
      if (problem) this.adding.setErrors(problem);
    });
  }

  protected add(event: Event): void {
    event.preventDefault();
    const shape = this.shape();
    const name = this.adding.value;
    if (shape.type !== "record" || !name || this.addProblem()) return;
    (this.control() as FormRecord).addControl(name, build(shape.value, undefined));
    this.adding.reset("");
    this.changes.update((n) => n + 1);
  }

  protected remove(name: string): void {
    (this.control() as FormRecord).removeControl(name);
    this.control().markAsDirty();
    this.changes.update((n) => n + 1);
  }

  protected addRow(): void {
    const shape = this.shape();
    if (shape.type !== "list") return;
    (this.control() as FormArray).push(build(shape.item, undefined));
    this.control().markAsDirty();
    this.changes.update((n) => n + 1);
  }

  protected removeRow(i: number): void {
    (this.control() as FormArray).removeAt(i);
    this.control().markAsDirty();
    this.changes.update((n) => n + 1);
  }
}
