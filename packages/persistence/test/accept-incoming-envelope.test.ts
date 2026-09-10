import { AcceptIncomingEnvelope, withUnitOfWork } from "@kookbot/application";
import {
  ActorRef,
  BotPlatform,
  ConversationAddress,
  Message,
  MessageEnvelope,
  SessionStatus,
  TransportFlow,
  TransportRef,
  unixMillis,
  type NormalizedIncoming,
} from "@kookbot/domain";
import { FakeUnitOfWork, MemoryOutboxRepository, MemoryStore, fakeUnitOfWorkFactory } from "@kookbot/persistence";
import { afterEach, describe, expect, it, vi } from "vitest";

function incoming(key = "e1", owner = "u1", room = "c1", reply?: string): NormalizedIncoming {
  return {
    envelope: new MessageEnvelope({
      message: new Message({ content: "hello" }),
      sender: new ActorRef({ externalId: owner }),
      transport: new TransportRef({
        externalMessageId: key,
        ...(reply === undefined ? {} : { externalReplyToMessageId: reply }),
      }),
      idempotencyKey: `kook:${key}`,
      transportFlow: TransportFlow.INBOUND,
    }),
    address: new ConversationAddress({ platform: BotPlatform.KOOK, roomId: room }),
  };
}

afterEach(() => vi.restoreAllMocks());

function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected value to be defined");
  return value;
}

describe("AcceptIncomingEnvelope", () => {
  it("persists one transaction without mutating the source DTO", async () => {
    const store = new MemoryStore();
    const service = new AcceptIncomingEnvelope(fakeUnitOfWorkFactory(store));
    const source = incoming();
    const result = await service.execute(source);
    const state = store.snapshot();

    expect(result.status).toBe("accepted");
    expect(source.envelope.conversationId).toBeUndefined();
    expect(state.envelopes.get(result.envelopeId)?.conversationId).toBe(result.conversationId);
    expect(state.sessionEnvelopes).toHaveLength(1);
    expect([...state.outboxEvents.values()][0]).toMatchObject({
      runId: result.runId,
      envelopeId: result.envelopeId,
      publishedAt: undefined,
    });
    expect(state.sessions.get(defined(result.sessionId))?.status).toBe(SessionStatus.QUEUED);
  });

  it("accepts concurrent duplicates exactly once", async () => {
    const store = new MemoryStore();
    const service = new AcceptIncomingEnvelope(fakeUnitOfWorkFactory(store));
    const results = await Promise.all(Array.from({ length: 10 }, () => service.execute(incoming())));
    const state = store.snapshot();

    expect(results.filter((result) => result.status === "accepted")).toHaveLength(1);
    expect(new Set(results.map((result) => result.runId))).toHaveLength(1);
    for (const collection of [
      state.envelopes,
      state.messages,
      state.sessions,
      state.sessionEnvelopes,
      state.agentRuns,
      state.outboxEvents,
    ]) {
      expect(collection).toHaveLength(1);
    }
  });

  it("preserves follow-up order while isolating owner and conversation scopes", async () => {
    const store = new MemoryStore();
    const service = new AcceptIncomingEnvelope(fakeUnitOfWorkFactory(store));
    const first = await service.execute(incoming());
    const followups = await Promise.all(
      Array.from({ length: 6 }, (_, index) => service.execute(incoming(`e${index + 2}`))),
    );
    expect(new Set(followups.map((result) => result.sessionId))).toEqual(new Set([first.sessionId]));
    expect([...store.snapshot().agentRuns.values()].map((run) => run.attempt).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const otherOwner = await service.execute(incoming("e8", "u2", "c1", "e1"));
    const otherRoom = await service.execute(incoming("e9", "u1", "c2"));
    expect(otherOwner.sessionId).not.toBe(first.sessionId);
    expect(otherRoom.conversationId).not.toBe(first.conversationId);
  });

  it("rolls back a late write failure and permits retry", async () => {
    const store = new MemoryStore();
    const service = new AcceptIncomingEnvelope(fakeUnitOfWorkFactory(store));
    const originalAdd = MemoryOutboxRepository.prototype.add;
    vi.spyOn(MemoryOutboxRepository.prototype, "add").mockImplementationOnce(async function (
      this: MemoryOutboxRepository,
      event,
    ) {
      await originalAdd.call(this, event);
      throw new Error("injected late failure");
    });

    await expect(service.execute(incoming())).rejects.toThrow("injected late failure");
    expect(store.snapshot().conversations).toHaveLength(0);
    expect((await service.execute(incoming())).status).toBe("accepted");
    expect(store.snapshot().agentRuns).toHaveLength(1);
  });

  it("does not create a conversation for invalid input", async () => {
    const store = new MemoryStore();
    await expect(new AcceptIncomingEnvelope(fakeUnitOfWorkFactory(store)).execute(incoming("e1", ""))).rejects.toThrow(
      "sender",
    );
    expect(store.snapshot().conversations).toHaveLength(0);
  });

  it("keeps outbox events pending until explicit acknowledgement", async () => {
    const store = new MemoryStore();
    await new AcceptIncomingEnvelope(fakeUnitOfWorkFactory(store)).execute(incoming());
    await withUnitOfWork(fakeUnitOfWorkFactory(store), async (uow) => {
      const events = await uow.outbox.listPending();
      expect(events).toHaveLength(1);
      await uow.outbox.markPublished(defined(events[0]).id, unixMillis(123));
    });
    await withUnitOfWork(fakeUnitOfWorkFactory(store), async (uow) => {
      expect(await uow.outbox.listPending()).toEqual([]);
    });
  });

  it("does not report acceptance or retain the lock when commit fails", async () => {
    class FailingCommit extends FakeUnitOfWork {
      override async commit(): Promise<void> {
        throw new Error("commit failed");
      }
    }
    const store = new MemoryStore();
    await expect(new AcceptIncomingEnvelope(() => new FailingCommit(store)).execute(incoming())).rejects.toThrow(
      "commit failed",
    );
    expect(store.snapshot().conversations).toHaveLength(0);
    await expect(new AcceptIncomingEnvelope(fakeUnitOfWorkFactory(store)).execute(incoming())).resolves.toMatchObject({
      status: "accepted",
    });
  });

  it("prefers the active session linked to the reply target", async () => {
    const store = new MemoryStore();
    const service = new AcceptIncomingEnvelope(fakeUnitOfWorkFactory(store));
    const first = await service.execute(incoming());
    await withUnitOfWork(fakeUnitOfWorkFactory(store), async (uow) => {
      const session = defined(await uow.sessions.get(defined(first.sessionId)));
      session.status = SessionStatus.COMPLETED;
      await uow.sessions.save(session);
    });
    const second = await service.execute(incoming("e2"));
    await withUnitOfWork(fakeUnitOfWorkFactory(store), async (uow) => {
      const session = defined(await uow.sessions.get(defined(first.sessionId)));
      session.status = SessionStatus.WAITING_USER;
      await uow.sessions.save(session);
    });

    const reply = await service.execute(incoming("e3", "u1", "c1", "e2"));
    expect(reply.sessionId).toBe(second.sessionId);
    expect(store.snapshot().envelopes.get(reply.envelopeId)?.replyToEnvelopeId).toBe(second.envelopeId);
  });
});
