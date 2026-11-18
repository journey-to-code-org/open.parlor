// Mini Golf courses and bowling lanes people have shared: take one out of its game, or put it back.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { Admin, when } from "../admin";
import type { SharedCourse } from "../api";
import { Ask } from "../ask";

const LANE: Record<string, string> = { ".": "lane", "#": "crate", s: "sand", w: "water", "^": "lane-slope", v: "lane-slope", "<": "lane-slope", ">": "lane-slope", o: "bumper" };
const PIECE: Record<string, string> = { ".": "garden", g: "green", "#": "wall", s: "sand", w: "water", "^": "slope", v: "slope", "<": "slope", ">": "slope", o: "bumper", t: "tee", c: "cup", h: "high", "1": "mouth", "2": "mouth", "3": "mouth", x: "molehill", y: "molehill", z: "molehill" };

@Component({
  selector: "app-courses",
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (admin.courses().length) {
      <auto-grid min="15rem" gap="1rem">
        @for (c of admin.courses(); track c.id) {
          <content-card [heading]="c.course.name">
            <div slot="media" class="course-plan">
              @let first = firstHole(c);
              <div class="plan" [style.--cols]="first.cols" [style.--rows]="first.rows" role="img" [attr.aria-label]="c.kind === 'bowling' ? 'The lane' : 'The first hole, ' + first.name">
                @for (square of plan(first, c.kind); track $index) {
                  <span [class]="square"></span>
                }
              </div>
            </div>
            <span class="by">by {{ c.author }} · {{ when(c.updated) }}</span>
            <span class="by">{{ holesLine(c) }}</span>
            <cluster-layout gap="0.4rem" class="tags">
              @if (c.hidden) {
                <status-badge variant="danger" [dot]="true">Hidden</status-badge>
              } @else {
                <status-badge variant="success" [dot]="true">{{ c.kind === "bowling" ? "In Bowling" : "In Mini Golf" }}</status-badge>
              }
              @if (c.blocked) {
                <status-badge variant="warning">Maker is blocked</status-badge>
              }
            </cluster-layout>
            @if (c.hidden) {
              <p class="reason">{{ c.hidden }}</p>
            }
            <div slot="footer">
              @if (c.hidden) {
                <action-button variant="outline" size="sm" (click)="restore(c)">Put back in {{ c.kind === "bowling" ? "Bowling" : "Mini Golf" }}</action-button>
              } @else {
                <action-button variant="destructive" size="sm" (click)="hide(c)">Hide from {{ c.kind === "bowling" ? "Bowling" : "Mini Golf" }}</action-button>
              }
            </div>
          </content-card>
        }
      </auto-grid>
    } @else {
      <empty-state heading="No shared courses or lanes yet">
        Mini Golf courses and bowling lanes people make and share show up here, so you can take one down if you need to.
        <action-button slot="actions" variant="outline" href="../?golf=new" target="_blank">Open the course editor</action-button>
      </empty-state>
    }
  `,
})
export class CoursesPage {
  protected readonly admin = inject(Admin);
  private readonly ask = inject(Ask);
  protected readonly when = when;

  /** What to draw for a course: its first hole (every saved course has one); a lane is its own grid. */
  protected firstHole(course: SharedCourse): { name: string; cols: number; rows: number; cells: string } {
    const c = course.course;
    if (course.kind === "bowling") return { name: c.name, cols: c.cols ?? 1, rows: c.rows ?? 1, cells: c.cells ?? "." };
    return c.holes?.[0] ?? { name: "", cols: 1, rows: 1, cells: "." };
  }

  /** What a course or lane has, in a line. */
  protected holesLine(course: SharedCourse): string {
    const holes = course.course.holes ?? [];
    if (course.kind === "bowling") return "A bowling lane";
    return `${holes.length} ${holes.length === 1 ? "hole" : "holes"}: ${holes.map((h) => h.name).join(", ")}`;
  }

  /** A hole (or a lane) as a little plan: one class a square, by the piece painted there. */
  protected plan(hole: { cells: string }, kind: SharedCourse["kind"] = "minigolf"): string[] {
    return [...hole.cells].map((p) => (kind === "bowling" ? (LANE[p] ?? "lane") : (PIECE[p] ?? "garden")));
  }

  protected hide(course: SharedCourse): void {
    this.ask.ask({
      title: `Hide “${course.course.name}”?`,
      body: `It comes out of ${course.kind === "bowling" ? "Bowling's lane" : "Mini Golf's course"} list, so nobody can open a new table on it; tables already playing it finish. ${course.author} keeps it and sees your reason. You can put it back later.`,
      field: "Reason",
      help: `${course.author} sees this.`,
      action: course.kind === "bowling" ? "Hide lane" : "Hide course",
      run: async (reason) => {
        await this.admin.api.hideCourse(course.id, reason);
        return `Hid “${course.course.name}”.`;
      },
    });
  }

  protected restore(course: SharedCourse): Promise<void> {
    return this.admin.act(async () => {
      await this.admin.api.restoreCourse(course.id);
      return `“${course.course.name}” is back in ${course.kind === "bowling" ? "Bowling" : "Mini Golf"}.`;
    });
  }
}
