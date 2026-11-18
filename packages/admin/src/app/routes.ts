// The admin app's pages, each at an address of its own under /admin/: a link to one can be kept,
// shared with whoever else runs the parlor, or come back to with the browser's Back button. Every
// page but signing in needs the admin token; the pages load when they're first opened.
import { inject } from "@angular/core";
import { Router, type CanActivateFn, type Routes } from "@angular/router";
import { Admin } from "./admin";
import { Shell } from "./shell";
import { SECTIONS } from "./sections";
import { SignIn } from "./sign-in";

/** Signed in, or signed in now with the token this tab kept; otherwise to the door, and back after. */
const signedIn: CanActivateFn = async (_, state) => {
  const admin = inject(Admin);
  const router = inject(Router);
  if (admin.signedIn()) return true;
  const kept = admin.token();
  if (kept) {
    const problem = await admin.signIn(kept);
    if (!problem) return true;
    admin.signInError.set(problem);
  }
  return router.createUrlTree(["/sign-in"], { queryParams: state.url === "/" ? {} : { next: state.url } });
};

/** The door is for those who aren't in yet: with a token this tab kept that still works, go in. */
const signedOut: CanActivateFn = async () => {
  const admin = inject(Admin);
  const router = inject(Router);
  if (!admin.signedIn() && admin.token()) await admin.signIn(admin.token());
  return admin.signedIn() ? router.createUrlTree(["/"]) : true;
};

const title = (section: (typeof SECTIONS)[number]["value"]) => `${SECTIONS.find((s) => s.value === section)!.label} · open.parlor admin`;

export const routes: Routes = [
  { path: "sign-in", component: SignIn, canActivate: [signedOut], title: "Sign in · open.parlor admin" },
  {
    path: "",
    component: Shell,
    canActivate: [signedIn],
    children: [
      { path: "", pathMatch: "full", redirectTo: "overview" },
      { path: "overview", title: title("overview"), loadComponent: () => import("./pages/overview").then((m) => m.OverviewPage) },
      {
        path: "tables",
        title: title("tables"),
        loadComponent: () => import("./pages/tables").then((m) => m.TablesPage),
        // One table, in a dialog over the list: its own address, so it can be sent to someone.
        children: [{ path: ":id", loadComponent: () => import("./pages/table").then((m) => m.TablePage) }],
      },
      { path: "players", title: title("players"), loadComponent: () => import("./pages/players").then((m) => m.PlayersPage) },
      { path: "houses", title: title("houses"), loadComponent: () => import("./pages/houses").then((m) => m.HousesPage) },
      { path: "games", title: title("games"), loadComponent: () => import("./pages/games").then((m) => m.GamesPage) },
      { path: "designs", title: title("designs"), loadComponent: () => import("./pages/designs").then((m) => m.DesignsPage) },
      { path: "courses", title: title("courses"), loadComponent: () => import("./pages/courses").then((m) => m.CoursesPage) },
      { path: "activity", title: title("activity"), loadComponent: () => import("./pages/activity").then((m) => m.ActivityPage) },
    ],
  },
  { path: "**", redirectTo: "" },
];
