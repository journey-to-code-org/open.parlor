// The way in: the admin token, as a reactive form. After it, back to the page that was asked for
// (`?next=`), or the overview.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, inject, input, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { ZubraModel } from "@zubra/runtime/angular";
import { Admin } from "./admin";

@Component({
  selector: "app-sign-in",
  imports: [ReactiveFormsModule, ZubraModel],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="door">
      <form class="door-card" [formGroup]="form" (ngSubmit)="signIn()" novalidate>
        <div class="suits" aria-hidden="true">♠&#xFE0E; ♥&#xFE0E; ♣&#xFE0E; ♦&#xFE0E;</div>
        <h1>open.parlor admin</h1>
        <p class="quiet">For whoever runs this parlor. Sign in with the admin token you set on the server.</p>
        @if (problem() || admin.signInError(); as why) {
          <alert-banner variant="danger" heading="Couldn't sign in">{{ why }}</alert-banner>
        }
        <text-field
          zubraModel
          formControlName="token"
          type="password"
          label="Admin token"
          description="The server's CARDROOM_ADMIN_TOKEN setting. It stays in this tab and is forgotten when you close it."
          autocomplete="current-password"
          [required]="true"
        ></text-field>
        <action-button type="submit" [loading]="checking()">Sign in</action-button>
        <a class="back" href="../">Back to the parlor</a>
      </form>
    </main>
  `,
})
export class SignIn {
  protected readonly admin = inject(Admin);
  private readonly router = inject(Router);
  /** Where to go once signed in: the page that sent here (a query parameter). */
  readonly next = input<string>();

  protected readonly form = new FormGroup({ token: new FormControl("", { nonNullable: true, validators: [Validators.required] }) });
  protected readonly checking = signal(false);
  protected readonly problem = signal("");

  protected async signIn(): Promise<void> {
    if (this.checking()) return;
    this.admin.signInError.set("");
    const token = this.form.value.token?.trim() ?? "";
    if (!token) return void this.problem.set("Enter the admin token.");
    this.checking.set(true);
    this.form.disable();
    const problem = await this.admin.signIn(token);
    this.checking.set(false);
    this.form.enable();
    this.problem.set(problem);
    if (problem) return;
    this.form.reset();
    // Only a page of this app: a full address in ?next= is ignored.
    const next = this.next();
    await this.router.navigateByUrl(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
  }
}
