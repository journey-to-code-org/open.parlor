// The assistant: describe a change in words, look at what it proposes, say what to adjust, and try it.
// It talks to the parlor's own AI key through the server (the browser never holds a key). Numbers can
// be tried as a live override, with a question first; code only ever becomes a draft pull request.
// Nothing a model says is applied by itself: what is sent back is only the proposal's id.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, inject, output, signal, type OnInit } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ZubraModel } from "@zubra/runtime/angular";
import { Admin, message } from "../admin";
import { type AssistantAnswer, type AssistantProposal, type AssistantState, type TunableGame } from "../api";
import { Ask } from "../ask";

interface Turn {
  role: "user" | "assistant";
  text: string;
  answer?: AssistantAnswer;
  /** Set once a proposal has been tried or opened: what happened, and where. */
  done?: { text: string; url?: string };
}

/** The most turns sent to the model; the server takes 24. */
const KEEP = 24;

@Component({
  selector: "app-assistant",
  imports: [ReactiveFormsModule, ZubraModel],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as s) {
      <section class="assistant" aria-label="Assistant" data-testid="assistant">
        <h2>Assistant</h2>
        @if (!s.enabled) {
          <p class="quiet">Off: this parlor has no AI key. Set CARDROOM_AI_KEY to turn it on.</p>
        } @else {
          <p class="quiet">
            Describe a change ("make the daily sudoku easier on weekdays", "the Back Room's first foe hits too hard"). It proposes numbers you can try live, and {{ s.canReadCode ? "code as a draft pull request" : "no code (pull requests aren't set up)" }}. Nothing happens until you say so. Model: {{ s.model }}.
          </p>
          <ol class="turns" aria-live="polite">
            @for (turn of turns(); track $index) {
              <li [class]="'turn ' + turn.role">
                <strong>{{ turn.role === "user" ? "You" : "Assistant" }}</strong>
                <p class="said">{{ turn.text }}</p>
                @if (turn.answer; as a) {
                  @if (a.looked.length) { <p class="quiet">Looked at: {{ a.looked.join(", ") }}</p> }
                  @if (a.problems?.length) {
                    <alert-banner variant="warning" heading="It couldn't make that pass the checks">
                      @for (p of a.problems; track p) { <div>{{ p }}</div> }
                    </alert-banner>
                  }
                  @if (a.proposal; as p) {
                    @if (p.kind === "tunables") {
                      <div class="proposal" data-testid="proposal-numbers">
                        <strong>New numbers for {{ p.gameName }}</strong>
                        <table class="changes">
                          <thead><tr><th>Number</th><th>Now</th><th>Proposed</th></tr></thead>
                          <tbody>
                            @for (c of p.changes; track c.path) { <tr><td>{{ c.path }}</td><td>{{ c.from || "the game's own" }}</td><td>{{ c.to || "the game's own" }}</td></tr> }
                          </tbody>
                        </table>
                        @if (!p.changes.length) { <p class="quiet">Nothing differs from what is saved.</p> }
                        <div class="actions">
                          <action-button [disabled]="busy() || !!turn.done || !p.changes.length" (click)="apply(turn, p)">Try it live</action-button>
                          @if (turn.done; as d) { <span class="quiet">{{ d.text }}</span> }
                          @else { <span class="quiet">Saves these as the game's live override. Games read them when they start. Say what to change to keep going.</span> }
                        </div>
                      </div>
                    } @else {
                      <div class="proposal" data-testid="proposal-code">
                        <strong>{{ p.title }}</strong>
                        <p class="quiet">{{ p.summary }}</p>
                        @for (f of p.files; track f.path) {
                          <details>
                            <summary>{{ f.path }} ({{ f.isNew ? "new file, " : "" }}+{{ f.added }} -{{ f.removed }})</summary>
                            <pre class="diff"><code>@for (line of lines(f.diff); track $index) {<span [class]="line.kind">{{ line.text }}
</span>}</code></pre>
                          </details>
                        }
                        <div class="actions">
                          <action-button [disabled]="busy() || !!turn.done" (click)="openPullRequest(turn, p)">Open a draft pull request</action-button>
                          @if (turn.done; as d) {
                            <span class="quiet">{{ d.text }} @if (d.url) { <a [href]="d.url" target="_blank" rel="noopener">{{ d.url }}</a> }</span>
                          } @else { <span class="quiet">A new branch and a draft for review. Nothing is merged and nothing goes live.</span> }
                        </div>
                      </div>
                    }
                  }
                }
              </li>
            }
          </ol>
          @if (error()) { <alert-banner variant="danger" heading="The assistant couldn't answer">{{ error() }}</alert-banner> }
          <form (submit)="send($event)" novalidate [attr.aria-busy]="busy()">
            <text-field zubraModel [formControl]="input" label="Your message" [rows]="3" [maxlength]="s.maxTurn" placeholder="What should change?"></text-field>
            <div class="actions">
              <action-button type="submit" [loading]="busy()" [disabled]="busy() || !input.value.trim()">Send</action-button>
              <action-button variant="outline" [disabled]="busy() || !turns().length" (click)="clear()">New conversation</action-button>
              @if (busy()) { <span class="quiet">Thinking: it may be reading files first.</span> }
            </div>
          </form>
        }
      </section>
    }
  `,
})
export class AssistantPanel implements OnInit {
  private readonly admin = inject(Admin);
  private readonly ask = inject(Ask);
  /** Numbers were saved as the game's live override: the page refreshes what it shows. */
  readonly applied = output<{ game: string; saved: TunableGame["saved"] }>();
  protected readonly state = signal<AssistantState | null>(null);
  protected readonly turns = signal<Turn[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal("");
  protected readonly input = new FormControl("", { nonNullable: true });

  async ngOnInit(): Promise<void> {
    try {
      this.state.set(await this.admin.api.assistant());
    } catch {
      /* an older server has no assistant: the page simply has none */
    }
  }

  /** A diff's lines, each marked for colour by its first character. */
  protected lines(diff: string): { kind: string; text: string }[] {
    return diff.split("\n").map((text) => ({ kind: text.startsWith("+") ? "add" : text.startsWith("-") ? "del" : "same", text }));
  }

  protected clear(): void {
    this.turns.set([]);
    this.error.set("");
  }

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    const text = this.input.value.trim();
    if (!text || this.busy()) return;
    this.error.set("");
    this.turns.update((all) => [...all, { role: "user", text }]);
    this.input.reset("");
    this.busy.set(true);
    try {
      // The last turns, starting with the host's own: the model sees the conversation, not the proposals' details.
      let sent = this.turns().slice(-KEEP).map(({ role, text }) => ({ role, content: text }));
      while (sent.length && sent[0]!.role !== "user") sent = sent.slice(1);
      const answer = await this.admin.api.assistantChat(sent);
      this.turns.update((all) => [...all, { role: "assistant", text: answer.reply || (answer.proposal ? "Here is a proposal." : "…"), answer }]);
    } catch (error) {
      this.error.set(message(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected apply(turn: Turn, p: Extract<AssistantProposal, { kind: "tunables" }>): void {
    this.ask.ask({
      title: `Try these numbers for ${p.gameName}?`,
      body: "They are saved as the game's live override, so games started from now on play by them. A game already going keeps its numbers. You can put the game's own numbers back on this page.",
      action: "Try them live",
      run: async () => {
        const done = await this.admin.api.assistantApply(p.id);
        this.applied.emit(done);
        this.turns.update((all) => all.map((t) => (t === turn ? { ...t, done: { text: `Saved as version ${done.saved.version}.` } } : t)));
        return `${p.gameName}: version ${done.saved.version} is live.`;
      },
    });
  }

  protected openPullRequest(turn: Turn, p: Extract<AssistantProposal, { kind: "code" }>): void {
    this.ask.ask({
      title: "Open a draft pull request?",
      body: `"${p.title}": ${p.files.length} file${p.files.length === 1 ? "" : "s"} are written to a new branch and a draft pull request is opened for review. Nothing is merged and nothing goes live.`,
      action: "Open the pull request",
      run: async () => {
        const made = await this.admin.api.assistantPullRequest(p.id);
        this.turns.update((all) => all.map((t) => (t === turn ? { ...t, done: { text: `Opened #${made.number}:`, url: made.url } } : t)));
        return `Pull request #${made.number} is open.`;
      },
    });
  }
}
