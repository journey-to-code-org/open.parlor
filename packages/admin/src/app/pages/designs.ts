// Card designs people have shared: take one out of the gallery, or put it back.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { deckStyle, type CardDesign } from "@journey-to-code/decks";
import { Admin, when } from "../admin";
import type { SharedDesign } from "../api";
import { Ask } from "../ask";

@Component({
  selector: "app-designs",
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (admin.designs().length) {
      <auto-grid min="15rem" gap="1rem">
        @for (d of admin.designs(); track d.id) {
          <content-card [heading]="d.design.name">
            <div slot="media" class="deck" [attr.style]="deck(d.design)">
              <playing-card [back]="true" size="table"></playing-card>
              @for (card of sample; track card.suit) {
                <playing-card [card]="card" size="table"></playing-card>
              }
            </div>
            <span class="by">by {{ d.author }} · {{ when(d.created) }}</span>
            <cluster-layout gap="0.4rem" class="tags">
              @if (d.hidden) {
                <status-badge variant="danger" [dot]="true">Hidden</status-badge>
              } @else {
                <status-badge variant="success" [dot]="true">In the gallery</status-badge>
              }
              @if (d.blocked) {
                <status-badge variant="warning">Maker is blocked</status-badge>
              }
            </cluster-layout>
            @if (d.hidden) {
              <p class="reason">{{ d.hidden }}</p>
            }
            <div slot="footer">
              @if (d.hidden) {
                <action-button variant="outline" size="sm" (click)="restore(d)">Put back in the gallery</action-button>
              } @else {
                <action-button variant="destructive" size="sm" (click)="hide(d)">Hide from the gallery</action-button>
              }
            </div>
          </content-card>
        }
      </auto-grid>
    } @else {
      <empty-state heading="No shared designs yet">
        Decks people share from the card designer show up here, so you can take one out of the gallery if you need to.
        <action-button slot="actions" variant="outline" href="../designer/" target="_blank">Open the card designer</action-button>
      </empty-state>
    }
  `,
})
export class DesignsPage {
  protected readonly admin = inject(Admin);
  private readonly ask = inject(Ask);
  protected readonly when = when;
  /** Two cards that show a design at a glance: its back is drawn beside them. */
  protected readonly sample = [
    { kind: "pip", suit: "spades", rank: 14 },
    { kind: "pip", suit: "diamonds", rank: 12 },
  ];

  protected deck(design: CardDesign): string {
    return deckStyle(design);
  }

  protected hide(design: SharedDesign): void {
    this.ask.ask({
      title: `Hide “${design.design.name}”?`,
      body: `It comes out of the gallery, so nobody else can see or use it. ${design.author} keeps it and sees your reason. You can put it back later.`,
      field: "Reason",
      help: `${design.author} sees this.`,
      action: "Hide design",
      run: async (reason) => {
        await this.admin.api.hideDesign(design.id, reason);
        return `Hid “${design.design.name}”.`;
      },
    });
  }

  protected restore(design: SharedDesign): Promise<void> {
    return this.admin.act(async () => {
      await this.admin.api.restoreDesign(design.id);
      return `“${design.design.name}” is back in the gallery.`;
    });
  }
}
