// Every house: rename it, hand it to someone else, take a member out, or delete it.
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { Admin } from "../admin";
import type { House, HouseMember } from "../api";
import { Ask } from "../ask";

@Component({
  selector: "app-houses",
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (admin.houses().length) {
      <auto-grid min="19rem" gap="1rem">
        @for (house of admin.houses(); track house.slug) {
          <content-card [heading]="house.name">
            <span class="by">{{ house.members.length }} {{ house.members.length === 1 ? "member" : "members" }} · {{ house.tables }} {{ house.tables === 1 ? "table" : "tables" }} opened</span>
            <ul class="members">
              @for (member of house.members; track member.id) {
                <li>
                  <user-avatar [name]="member.name" size="sm"></user-avatar>
                  <span class="who">
                    {{ member.name }}
                    @if (member.role !== "member") {
                      <status-badge [variant]="member.role === 'owner' ? 'primary' : 'outline'">{{ member.role === "owner" ? "Owner" : "Admin" }}</status-badge>
                    }
                    @if (member.blocked) {
                      <status-badge variant="danger">Blocked</status-badge>
                    }
                  </span>
                  @if (member.role !== "owner") {
                    <action-button variant="ghost" size="sm" [label]="'Make ' + member.name + ' the owner'" (click)="owner(house, member)">Make owner</action-button>
                    <action-button variant="ghost" size="sm" [label]="'Remove ' + member.name + ' from the house'" (click)="removeMember(house, member)">Remove</action-button>
                  }
                </li>
              }
            </ul>
            <cluster-layout slot="footer" gap="0.5rem">
              <action-button variant="outline" size="sm" (click)="rename(house)">Rename</action-button>
              <action-button variant="destructive" size="sm" (click)="remove(house)">Delete house</action-button>
            </cluster-layout>
          </content-card>
        }
      </auto-grid>
    } @else {
      <empty-state heading="No houses yet">A house is a family's own corner of the parlor: its members, its house rules and its tournaments. When someone starts one, it shows up here.</empty-state>
    }
  `,
})
export class HousesPage {
  protected readonly admin = inject(Admin);
  private readonly ask = inject(Ask);

  protected rename(house: House): void {
    this.ask.ask({
      title: `Rename ${house.name}?`,
      body: "Everyone in the house sees the new name. Its invite link stays the same.",
      field: "House name",
      initial: house.name,
      required: true,
      max: 30,
      action: "Rename house",
      run: async (name) => {
        await this.admin.api.renameHouse(house.slug, name);
        return `Renamed the house to ${name}.`;
      },
    });
  }

  protected owner(house: House, member: HouseMember): void {
    const owner = house.members.find((m) => m.role === "owner");
    this.ask.ask({
      title: `Make ${member.name} the owner of ${house.name}?`,
      body: `The owner sets the house's rules and roles. ${owner ? `${owner.name} stays in the house as an admin.` : ""}`,
      action: "Make owner",
      run: async () => {
        await this.admin.api.makeOwner(house.slug, member.id);
        return `${member.name} now owns ${house.name}.`;
      },
    });
  }

  protected removeMember(house: House, member: HouseMember): void {
    this.ask.ask({
      title: `Remove ${member.name} from ${house.name}?`,
      body: "They lose the house's tables, rules and tournaments. They could join again with its invite link unless you block them.",
      action: "Remove from house",
      run: async () => {
        await this.admin.api.removeMember(house.slug, member.id);
        return `Removed ${member.name} from ${house.name}.`;
      },
    });
  }

  protected remove(house: House): void {
    this.ask.ask({
      title: `Delete ${house.name}?`,
      body: `The house, its saved rules, its leaderboard and its tournaments are gone for all ${house.members.length} of its members. Tables already open carry on. This can't be undone.`,
      action: "Delete house",
      run: async () => {
        await this.admin.api.deleteHouse(house.slug);
        return `Deleted ${house.name}.`;
      },
    });
  }
}
