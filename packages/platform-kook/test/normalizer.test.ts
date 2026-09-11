import { describe, expect, it } from "vitest";
import { type KookMessageEvent, KookMessageNormalizer, KookMessageType, type KookUser } from "../src/index.js";
import { BotPlatform, MessageRole, TransportFlow } from "@kookbot/domain";

const human: KookUser = {
  id: "user-1",
  username: "alice",
  nickname: "Alice",
  avatar: "https://example.com/avatar.png",
  bot: false,
};

function event(overrides: Partial<KookMessageEvent> = {}): KookMessageEvent {
  return {
    channel_type: "GROUP",
    type: KookMessageType.KMARKDOWN,
    target_id: "channel-1",
    author_id: human.id,
    content: "(met)bot-1(met) hello",
    msg_id: "message-1",
    msg_timestamp: 1_700_000_000_000,
    nonce: "nonce-1",
    extra: {
      type: KookMessageType.KMARKDOWN,
      guild_id: "guild-1",
      mention: ["bot-1"],
      mention_all: false,
      mention_roles: [],
      mention_here: false,
      author: human,
      ...(overrides.extra ?? {}),
    },
    ...overrides,
  };
}

describe("KookMessageNormalizer", () => {
  const normalizer = new KookMessageNormalizer();

  it("normalizes a mentioned guild message with stable transport identity", () => {
    const incoming = normalizer.normalize(event(), "bot-1");
    expect(incoming?.address).toMatchObject({
      platform: BotPlatform.KOOK,
      spaceId: "guild-1",
      roomId: "channel-1",
      externalId: undefined,
    });
    expect(incoming?.envelope).toMatchObject({
      idempotencyKey: "kook:message-1",
      transportFlow: TransportFlow.INBOUND,
      message: { role: MessageRole.USER, content: "hello" },
      transport: { externalMessageId: "message-1", externalEventId: "nonce-1" },
    });
  });

  it("filters self/bot messages and unmentioned guild messages", () => {
    expect(normalizer.normalize(event({ extra: { ...event().extra, mention: [] } }), "bot-1")).toBeUndefined();
    expect(
      normalizer.normalize(
        event({ author_id: "bot-1", extra: { ...event().extra, author: { ...human, id: "bot-1" } } }),
        "bot-1",
      ),
    ).toBeUndefined();
    expect(
      normalizer.normalize(event({ extra: { ...event().extra, author: { ...human, bot: true } } }), "bot-1"),
    ).toBeUndefined();
  });

  it("accepts direct messages without a mention and addresses the sender", () => {
    const incoming = normalizer.normalize(
      event({ channel_type: "PERSON", content: "hello privately", extra: { ...event().extra, mention: [] } }),
      "bot-1",
    );
    expect(incoming?.address).toMatchObject({ platform: BotPlatform.KOOK, externalId: "user-1", roomId: undefined });
    expect(incoming?.envelope.message?.content).toBe("hello privately");
  });

  it("preserves quote and attachment metadata", () => {
    const incoming = normalizer.normalize(
      event({
        type: KookMessageType.FILE,
        content: "file",
        extra: {
          ...event().extra,
          type: KookMessageType.FILE,
          quote: { id: "previous" },
          attachments: [{ type: "file", url: "https://example.com/a.txt", name: "a.txt", size: 12 }],
        },
      }),
      "bot-1",
    );
    expect(incoming?.envelope.transport?.externalReplyToMessageId).toBe("previous");
    expect(incoming?.envelope.message?.attachments[0]).toMatchObject({ name: "a.txt", size: 12 });
  });

  it("normalizes a direct file event with a single attachment object", () => {
    const incoming = normalizer.normalize(
      event({
        channel_type: "PERSON",
        type: KookMessageType.FILE,
        content: "https://example.com/a.txt",
        extra: {
          ...event().extra,
          type: KookMessageType.FILE,
          mention: [],
          attachments: { type: "file", url: "https://example.com/a.txt", name: "a.txt", size: 12 },
        },
      }),
      "bot-1",
    );
    expect(incoming?.envelope.message).toMatchObject({
      content: undefined,
      attachments: [expect.objectContaining({ name: "a.txt", sourceUrl: "https://example.com/a.txt" })],
    });
  });
});
