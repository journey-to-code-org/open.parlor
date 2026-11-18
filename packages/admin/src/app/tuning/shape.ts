// A game's tunables are described by a shape (packages/server/src/tunables.ts, sent to this app as JSON),
// and the form for a game is built from it: a number a field, a table an entry for each name, a list a row
// for each item. The server checks every save again; the checks here are so a mistake is shown where it
// was made, before anything is sent.
import { AbstractControl, FormArray, FormControl, FormGroup, FormRecord, type ValidationErrors, type ValidatorFn } from "@angular/forms";

export type Shape =
  | { type: "int"; min: number; max: number }
  | { type: "enum"; of: string[] }
  | { type: "record"; key: string; value: Shape; max: number }
  | { type: "object"; fields: Record<string, Shape>; required?: string[] }
  | { type: "list"; item: Shape; min: number; max: number };

/** A whole number from min to max, or nothing at all (which means "leave it as the game has it"). */
const whole = (min: number, max: number): ValidatorFn => (control) => {
  const text = String(control.value ?? "").trim();
  if (text === "") return null;
  if (!/^-?\d+$/.test(text)) return { whole: "Use a whole number." };
  const n = Number(text);
  return n < min || n > max ? { range: `From ${min} to ${max}.` } : null;
};

/** Fields the game can't do without: each must have something in it. */
const needed = (required: string[]): ValidatorFn => (control) => {
  const group = control as FormGroup;
  const empty = required.find((key) => String(group.controls[key]?.value ?? "").trim() === "");
  return empty ? { needed: `${empty} is needed.` } : null;
};

const listLength = (min: number, max: number): ValidatorFn => (control) => {
  const n = (control as FormArray).length;
  return n < min || n > max ? { length: `${min === max ? `Exactly ${min}` : `${min} to ${max}`} needed.` } : null;
};

/** The name of a card or foe: as the server wants it. */
export const nameCheck = (pattern: string, taken: () => string[] = () => []): ValidatorFn => (control) => {
  const name = String(control.value ?? "");
  if (!new RegExp(pattern).test(name)) return { name: "Lowercase letters, digits and dashes, starting with a letter." };
  return taken().includes(name) ? { taken: "Already there." } : null;
};

/** A form control for a shape, filled from a saved value (or empty). */
export function build(shape: Shape, value: unknown): AbstractControl {
  switch (shape.type) {
    case "int":
      return new FormControl(typeof value === "number" ? String(value) : "", { nonNullable: true, validators: [whole(shape.min, shape.max)] });
    case "enum":
      return new FormControl(typeof value === "string" ? value : (shape.of[0] ?? ""), { nonNullable: true });
    case "object": {
      const saved = isObject(value) ? value : {};
      const group = new FormGroup(
        Object.fromEntries(Object.entries(shape.fields).map(([key, field]) => [key, build(field, saved[key])])),
        { validators: [needed(shape.required ?? [])] },
      );
      return group;
    }
    case "record": {
      const saved = isObject(value) ? value : {};
      return new FormRecord(Object.fromEntries(Object.entries(saved).map(([key, item]) => [key, build(shape.value, item)])));
    }
    case "list": {
      const saved = Array.isArray(value) ? value : [];
      return new FormArray(
        saved.map((item) => build(shape.item, item)),
        { validators: [listLength(shape.min, shape.max)] },
      );
    }
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** What a form holds, as the server keeps it: a sparse value. Nothing typed is nothing saved; an entry with nothing in it goes. */
export function read(shape: Shape, control: AbstractControl): unknown {
  switch (shape.type) {
    case "int": {
      const text = String(control.value ?? "").trim();
      return text === "" ? undefined : Number(text);
    }
    case "enum":
      return control.value as string;
    case "object": {
      const group = control as FormGroup;
      const out: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(shape.fields)) {
        const item = read(field, group.controls[key]!);
        if (item !== undefined) out[key] = item;
      }
      return Object.keys(out).length ? out : undefined;
    }
    case "record": {
      const record = control as FormRecord;
      const out: Record<string, unknown> = {};
      for (const [key, c] of Object.entries(record.controls)) {
        const item = read(shape.value, c);
        if (item !== undefined) out[key] = item;
      }
      return Object.keys(out).length ? out : undefined;
    }
    case "list": {
      const items = (control as FormArray).controls.map((c) => read(shape.item, c));
      // A list is one thing: all of it or none. A row left empty is a mistake, not a gap.
      return items.length ? items : undefined;
    }
  }
}

/** The first thing wrong in a control, or in anything inside it, as words. */
export function firstProblem(control: AbstractControl): string {
  const errors: ValidationErrors | null = control.errors;
  if (errors) return String(Object.values(errors)[0]);
  const inside = control instanceof FormGroup || control instanceof FormRecord ? Object.values(control.controls) : control instanceof FormArray ? control.controls : [];
  for (const c of inside) {
    const found = firstProblem(c);
    if (found) return found;
  }
  return "";
}
