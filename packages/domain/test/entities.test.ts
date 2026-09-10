import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ActorRef,
  AgentRun,
  AgentRunStatus,
  Asset,
  Attachment,
  BotPlatform,
  ConversationAddress,
  Message,
  MessageEnvelope,
  Session,
  SessionStatus,
  TransportFlow,
  TransportRef,
  entityId,
  newId,
  unixMillis,
} from "@kookbot/domain";
import { describe, expect, it } from "vitest";

describe("domain values and entities", () => {
  it("creates validated compact identifiers and timestamps", () => {
    expect(newId()).toMatch(/^[0-9a-f]{32}$/);
    expect(() => entityId("  ")).toThrow("must not be empty");
    expect(unixMillis(123)).toBe(123);
    expect(() => unixMillis(-1)).toThrow("non-negative");
  });

  it("keeps reply and transport metadata on the envelope", () => {
    const message = new Message({ content: "hello" });
    const envelope = new MessageEnvelope({
      message,
      replyToEnvelopeId: entityId("previous"),
      transport: new TransportRef({ externalReplyToMessageId: "platform-previous" }),
      transportFlow: TransportFlow.INBOUND,
    });

    expect("replyToEnvelopeId" in message).toBe(false);
    expect(envelope.replyToEnvelopeId).toBe("previous");
    expect(envelope.transport?.externalReplyToMessageId).toBe("platform-previous");
  });

  it("models active and resumable session states", () => {
    expect(new Session({ status: SessionStatus.RUNNING }).isActive()).toBe(true);
    expect(new Session({ status: SessionStatus.WAITING_USER }).isActive()).toBe(true);
    expect(new Session({ status: SessionStatus.PAUSED }).isActive()).toBe(false);
    expect(new Session({ status: SessionStatus.PAUSED }).canResume()).toBe(true);
    expect(new AgentRun().status).toBe(AgentRunStatus.QUEUED);
  });

  it("derives stable conversation identity only from transport scope", () => {
    const first = new ConversationAddress({ platform: BotPlatform.KOOK, spaceId: "guild", roomId: "channel" });
    const same = new ConversationAddress({ platform: BotPlatform.KOOK, spaceId: "guild", roomId: "channel" });
    const topic = new ConversationAddress({
      platform: BotPlatform.KOOK,
      spaceId: "guild",
      roomId: "channel",
      topicId: "topic",
    });

    expect(first.identityKey()).toHaveLength(64);
    expect(first.identityKey()).toBe("5d03a370d0bd50ea91bd437f2b6eefc327d917bb4d4302a7577d3366d3772b51");
    expect(first.identityKey()).toBe(same.identityKey());
    expect(first.identityKey()).not.toBe(topic.identityKey());
    expect("userId" in first).toBe(false);
  });

  it("clones nested transport objects instead of sharing mutable state", () => {
    const source = new MessageEnvelope({
      sender: new ActorRef({ externalId: "u1" }),
      message: new Message({ content: "before" }),
    });
    const clone = source.clone();
    if (clone.message) clone.message.content = "after";
    expect(source.message?.content).toBe("before");
  });
});

describe("file metadata", () => {
  it("computes size and sha256 for assets and downloaded attachments", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kookbot-p2-"));
    const path = join(directory, "hello.txt");
    try {
      await writeFile(path, "hello");
      const asset = await Asset.fromLocal(path, { name: "hello.txt", mimeType: "text/plain" });
      const attachment = new Attachment({ name: "hello.txt" });
      await attachment.fillFromLocal(path);

      expect(asset.size).toBe(5);
      expect(asset.sha256).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
      expect(attachment.sha256).toBe(asset.sha256);
      expect(attachment.isDownloaded).toBe(true);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
