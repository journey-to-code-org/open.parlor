// The house's chat in the parlor: open.chat's, with a house as its room. The chat itself is tested
// in open.chat; this is what the parlor adds.
import { describe, expect, it, vi } from "vitest";
import { openHouseChat, roomOf } from "../src/house/chat";
import { houses } from "../src/housesApi";

describe("a house's chat", () => {
  it("is the room house:<slug>, and sends its changes to the house's route", async () => {
    const open = vi.fn((options: { room: string; send?: (body: Record<string, unknown>) => Promise<unknown> }) => ({ room: options.room, send: options.send }) as never);
    const sent = vi.spyOn(houses, "chatSend").mockResolvedValue({});
    const opened = openHouseChat("parts", { open }) as unknown as { room: string; send: (body: Record<string, unknown>) => Promise<unknown> };
    expect(roomOf("parts")).toBe("house:parts");
    expect(opened.room).toBe("house:parts");
    await opened.send({ text: "Spades at eight?" });
    expect(sent).toHaveBeenCalledWith("parts", { text: "Spades at eight?" });
  });
});
