import { BotPlatform, ConversationAddress, Message, entityId } from "@kookbot/domain";
import { describe, expect, it, vi } from "vitest";
import { KookPublisher, splitKookText, type KookSentMessage } from "../src/index.js";

function sent(id: string): KookSentMessage {
  return { id };
}

describe("KookPublisher", () => {
  it("sends channel messages in chunks and quotes only the first chunk", async () => {
    const sendTextMessage = vi.fn(async (_target: string, _content: string) =>
      sent(`m${sendTextMessage.mock.calls.length}`),
    );
    const sendDirectTextMessage = vi.fn(async () => sent("direct"));
    const publisher = new KookPublisher({ sendTextMessage, sendDirectTextMessage }, 10);
    const receipt = await publisher.publish({
      deliveryId: "delivery-1",
      message: new Message({ content: "1234567890abcdefghij" }),
      address: new ConversationAddress({ platform: BotPlatform.KOOK, roomId: "channel-1" }),
      externalReplyToMessageId: "quoted",
    });
    expect(sendTextMessage).toHaveBeenCalledTimes(2);
    expect(sendTextMessage.mock.calls[0]).toEqual(["channel-1", "1234567890", { quote: "quoted" }]);
    expect(sendTextMessage.mock.calls[1]).toEqual(["channel-1", "abcdefghij", undefined]);
    expect(sendDirectTextMessage).not.toHaveBeenCalled();
    expect(receipt.externalMessageIds).toEqual(["m1", "m2"]);
  });

  it("uses the direct-message API for a person address", async () => {
    const sendTextMessage = vi.fn(async () => sent("channel"));
    const sendDirectTextMessage = vi.fn(async () => sent("direct"));
    await new KookPublisher({ sendTextMessage, sendDirectTextMessage }).publish({
      deliveryId: entityId("delivery"),
      message: new Message({ content: "hello" }),
      address: new ConversationAddress({ platform: BotPlatform.KOOK, externalId: "user-1" }),
    });
    expect(sendDirectTextMessage).toHaveBeenCalledWith("user-1", "hello", undefined);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("prefers line boundaries and validates the size", () => {
    expect(splitKookText("first line\nsecond line", 12)).toEqual(["first line", "second line"]);
    expect(() => splitKookText("x", 0)).toThrow("positive");
  });
});
