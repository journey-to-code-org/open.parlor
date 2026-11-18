// The parlor's admin app: its host sees every table and everyone at them, and can close a table,
// take someone out of a seat, remove a chat message, block a player, look after houses, choose the
// games on the front page and hide a shared card design or course.
//
// Angular, with its router: each part is a page at its own address (routes.ts), loaded when it's
// first opened. Everything on the pages is a Zubra component (see zubra.ts): zubra-ui's tabs, data
// tables, dialogs, stat cards, badges, buttons, fields and toasts, and the parlor's own
// <playing-card> for previewing designs. Forms are Angular's reactive forms over Zubra's fields and
// switches, through `zubraModel`.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import "./zubra";

@Component({
  selector: "app-root",
  imports: [RouterOutlet],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <toast-region position="bottom-end" label="Notifications"></toast-region>
    <router-outlet />
  `,
})
export class App {}
