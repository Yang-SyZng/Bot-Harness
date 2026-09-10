import { withUnitOfWork } from "@kookbot/application";
import {
  AgentRun,
  Asset,
  BotPlatform,
  ConversationAddress,
  Message,
  MessageEnvelope,
  Session,
  SessionStatus,
  entityId,
} from "@kookbot/domain";
import { FakeUnitOfWork, MemoryStore, fakeUnitOfWorkFactory } from "@kookbot/persistence";
import { describe, expect, it } from "vitest";

describe("memory repositories", () => {
  it("reuses conversation identity and isolates returned objects", async () => {
    const store = new MemoryStore();
    const address = new ConversationAddress({ platform: BotPlatform.KOOK, roomId: "room-1" });
    await withUnitOfWork(fakeUnitOfWorkFactory(store), async (uow) => {
      const first = await uow.conversations.getOrCreateByAddress(address);
      const second = await uow.conversations.getOrCreateByAddress(address);
      expect(second.id).toBe(first.id);
      first.lastMessageAt = undefined;
    });
    expect(store.snapshot().conversations).toHaveLength(1);
  });

  it("orders and deduplicates session-envelope relations", async () => {
    const store = new MemoryStore();
    await withUnitOfWork(fakeUnitOfWorkFactory(store), async (uow) => {
      const conversation = await uow.conversations.getOrCreateByAddress(new ConversationAddress({ roomId: "room" }));
      const session = new Session({ conversationId: conversation.id, ownerUserId: "u1" });
      const first = new MessageEnvelope({
        conversationId: conversation.id,
        message: new Message({ content: "first" }),
      });
      const second = new MessageEnvelope({
        conversationId: conversation.id,
        message: new Message({ content: "second" }),
      });
      await uow.sessions.add(session);
      await uow.envelopes.add(first);
      await uow.envelopes.add(second);
      const link1 = await uow.sessionEnvelopes.attach({ sessionId: session.id, envelopeId: first.id });
      const duplicate = await uow.sessionEnvelopes.attach({ sessionId: session.id, envelopeId: first.id });
      const link2 = await uow.sessionEnvelopes.attach({ sessionId: session.id, envelopeId: second.id });
      expect(duplicate).toEqual(link1);
      expect([link1.sequenceNo, link2.sequenceNo]).toEqual([1, 2]);
      expect(await uow.sessionEnvelopes.listSessionIds(first.id)).toEqual([session.id]);
    });
  });

  it("rejects a relation across conversations", async () => {
    const store = new MemoryStore();
    await expect(
      withUnitOfWork(fakeUnitOfWorkFactory(store), async (uow) => {
        const session = new Session({ conversationId: entityId("c1"), ownerUserId: "u1" });
        const envelope = new MessageEnvelope({ conversationId: entityId("c2") });
        await uow.sessions.add(session);
        await uow.envelopes.add(envelope);
        await uow.sessionEnvelopes.attach({ sessionId: session.id, envelopeId: envelope.id });
      }),
    ).rejects.toThrow("different conversations");
    expect(store.snapshot().sessions).toHaveLength(0);
  });

  it("queries active sessions, ordered runs, and assets", async () => {
    const store = new MemoryStore();
    await withUnitOfWork(fakeUnitOfWorkFactory(store), async (uow) => {
      const session = new Session({
        id: entityId("s1"),
        conversationId: entityId("c1"),
        ownerUserId: "u1",
        status: SessionStatus.RUNNING,
      });
      await uow.sessions.add(session);
      await uow.agentRuns.add(new AgentRun({ sessionId: session.id, attempt: 2 }));
      await uow.agentRuns.add(new AgentRun({ sessionId: session.id, attempt: 1 }));
      await uow.assets.add(new Asset({ id: entityId("a1"), sha256: "abc" }));
      await uow.assets.add(new Asset({ id: entityId("a2"), sha256: "abc" }));

      expect((await uow.sessions.getActive({ conversationId: entityId("c1"), ownerUserId: "u1" }))?.id).toBe("s1");
      expect((await uow.agentRuns.listBySession(session.id)).map((run) => run.attempt)).toEqual([1, 2]);
      expect((await uow.assets.listBySha256("abc")).map((asset) => asset.id).sort()).toEqual(["a1", "a2"]);
    });
  });

  it("rolls back all pending changes", async () => {
    const store = new MemoryStore();
    await expect(
      withUnitOfWork(
        () => new FakeUnitOfWork(store),
        async (uow) => {
          await uow.conversations.getOrCreateByAddress(new ConversationAddress({ roomId: "room" }));
          throw new Error("fail");
        },
      ),
    ).rejects.toThrow("fail");
    expect(store.snapshot().conversations).toHaveLength(0);
  });
});
