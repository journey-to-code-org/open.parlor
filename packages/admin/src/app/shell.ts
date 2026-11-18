// Around every page once signed in: the header, the tabs (each a page at its own address), and the
// question dialog. Zubra's <tab-list> is the navigation: choosing a tab goes to its page, and going
// to a page (a link, Back) chooses its tab. Every tab has its panel from the start, and the chosen
// one holds whichever page the router shows: <tab-list> sets its panels up when a tab is chosen,
// so a panel that appeared or changed its tab later would stay unset (zubra-ui#23).
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterOutlet } from "@angular/router";
import { filter, map } from "rxjs";
import { Admin, detailOf } from "./admin";
import { AskDialog } from "./ask";
import { SECTIONS } from "./sections";
import "./zubra";

@Component({
  selector: "app-shell",
  imports: [RouterOutlet, AskDialog],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <header class="top">
        <div>
          <h1><span aria-hidden="true">♠&#xFE0E;</span> open.parlor admin</h1>
        </div>
        <cluster-layout gap="0.5rem" justify="flex-end">
          <action-button variant="outline" size="sm" (click)="admin.refresh()">Refresh</action-button>
          <action-button variant="ghost" size="sm" href="../" target="_blank">Open the parlor</action-button>
          <action-button variant="ghost" size="sm" (click)="admin.signOut()">Sign out</action-button>
        </cluster-layout>
      </header>

      @if (admin.loadError()) {
        <alert-banner variant="danger" heading="Couldn't load the latest">{{ admin.loadError() }}</alert-banner>
      }

      @if (!admin.loaded()) {
        <div class="waiting"><loading-spinner label="Loading the parlor" [inline]="true"></loading-spinner></div>
      } @else {
        <tab-list [tabs]="sections" [value]="section()" (valuechange)="go($event)" label="Sections">
          @for (s of sections; track s.value) {
            <section [attr.data-tab]="s.value">
              @if (s.value === section()) {
                <router-outlet />
              }
            </section>
          }
        </tab-list>
      }
    </div>
    <app-ask />
  `,
})
export class Shell {
  protected readonly admin = inject(Admin);
  private readonly router = inject(Router);
  protected readonly sections = SECTIONS;
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** The page showing: the first part of the address (/tables/abc is Tables). */
  protected readonly section = computed(() => this.router.parseUrl(this.url()).root.children["primary"]?.segments[0]?.path ?? "overview");

  protected go(event: Event): void {
    const to = detailOf<string>(event);
    if (to !== this.section()) void this.router.navigate([to]);
  }
}
