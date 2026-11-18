// Road to the Shootout: the pack it plays (the host's own, or the one it came with), and the
// workshop that makes one. The workshop is a page of its own beside this app (/admin/workshop/).
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { Admin, message, when } from "../admin";

@Component({
  selector: "app-shootout",
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <content-card heading="What the game plays">
      @if (admin.shootout(); as s) {
        @if (s.published; as p) {
          <p data-shootout-pack>
            <status-badge variant="success" [dot]="true">Your own</status-badge>
            “{{ p.name }}”, published {{ when(p.at) }} ({{ size(p.size) }}). Everyone who opens Road to the Shootout plays this.
          </p>
        } @else {
          <p class="quiet" data-shootout-pack>The game it came with. Nothing of your own has been published.</p>
        }
      } @else {
        <p class="quiet" data-shootout-pack>This parlor has nowhere to keep a pack.</p>
      }
      <p class="quiet">
        A pack is the game's whole content: its cars, rooms, parts, rivals and maps. The workshop edits one, with the game drawn beside it as you go, and publishes it here.
        A season someone has under way carries on if the new pack still has their cars and parts; otherwise they start again.
      </p>
      <div slot="footer">
        <cluster-layout gap="0.5rem">
          <action-button (click)="openWorkshop()" data-open-workshop>Open the workshop</action-button>
          <action-button variant="outline" [disabled]="publishing() || !admin.shootout()" (click)="packFile.click()">{{ publishing() ? "Publishing…" : "Publish a pack file" }}</action-button>
          @if (admin.shootout()?.published) {
            <action-button variant="destructive" (click)="reset()">Go back to the game it came with</action-button>
          }
        </cluster-layout>
        <input #packFile type="file" accept=".pack" hidden (change)="publish($event)" />
      </div>
    </content-card>
  `,
})
export class ShootoutPage {
  protected readonly admin = inject(Admin);
  protected readonly when = when;
  protected readonly publishing = signal(false);

  protected size(bytes: number): string {
    return bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  /** The workshop, in a tab of its own: opened from here, it has this tab's sign-in. */
  protected openWorkshop(): void {
    window.open(new URL("workshop/?host", document.baseURI).href, "_blank");
  }

  /** Publish a pack saved as a file from the workshop. */
  protected async publish(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || this.publishing()) return;
    this.publishing.set(true);
    try {
      const now = await this.admin.api.publishShootout(file);
      this.admin.shootout.set(now);
      this.admin.toast(`“${now.published?.name ?? "The pack"}” is what everyone plays now.`, "success");
    } catch (error) {
      this.admin.toast(message(error), "danger");
    }
    this.publishing.set(false);
    await this.admin.refresh();
  }

  protected reset(): Promise<void> {
    return this.admin.act(async () => {
      this.admin.shootout.set(await this.admin.api.resetShootout());
      return "Road to the Shootout is back to the game it came with.";
    });
  }
}
