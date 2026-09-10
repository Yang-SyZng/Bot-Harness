import { AcceptIncomingEnvelope, type AgentRuntime, type Logger, type MessagePublisher } from "@kookbot/application";
import {
  ActorRef,
  AgentRunStatus,
  BotPlatform,
  ConversationAddress,
  Message,
  MessageEnvelope,
  MessageRole,
  SessionStatus,
  TransportFlow,
  TransportRef,
  nowMs,
  type NormalizedIncoming,
  type OutgoingMessage,
} from "@kookbot/domain";
import { MemoryStore, fakeUnitOfWorkFactory } from "@kookbot/persistence";
import { describe, expect, it, vi } from "vitest";
import { MemoryOutboxWorker } from "../src/worker/index.js";

function incoming(): NormalizedIncoming {
  return {
    address: new ConversationAddress({ platform: BotPlatform.KOOK, roomId: "channel-1" }),
    envelope: new MessageEnvelope({
      message: new Message({ role: MessageRole.USER, content: "hello" }),
      sender: new ActorRef({ externalId: "user-1" }),
      transport: new TransportRef({ externalMessageId: "inbound-1" }),
      transportFlow: TransportFlow.INBOUND,
      idempotencyKey: "kook:inbound-1",
    }),
  };
}

function logger(): Logger {
  const value: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => value,
  };
  return value;
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`${name} was not returned`);
  return value;
}

describe("MemoryOutboxWorker", () => {
  it("executes, publishes, and persists the outbound reply", async () => {
    const store = new MemoryStore();
    const makeUnitOfWork = fakeUnitOfWorkFactory(store);
    const accepted = await new AcceptIncomingEnvelope(makeUnitOfWork).execute(incoming());
    const runtime: AgentRuntime = {
      run: vi.fn(async (input) => {
        expect(input.history).toEqual([]);
        expect(input.current.content).toBe("hello");
        return { status: "succeeded" as const, text: "world" };
      }),
    };
    const delivered: OutgoingMessage[] = [];
    const publisher: MessagePublisher = {
      publish: vi.fn(async (outgoing) => {
        delivered.push(outgoing);
        return {
          deliveryId: outgoing.deliveryId,
          externalMessageId: "outbound-1",
          externalMessageIds: ["outbound-1"],
          sentAt: nowMs(),
        };
      }),
    };

    await new MemoryOutboxWorker(makeUnitOfWork, runtime, publisher, logger()).drain();
    const state = store.snapshot();
    const outbound = [...state.envelopes.values()].find(
      (envelope) => envelope.transportFlow === TransportFlow.OUTBOUND,
    );
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      deliveryId: accepted.runId,
      externalReplyToMessageId: "inbound-1",
      message: { content: "world" },
    });
    expect(outbound).toMatchObject({
      conversationId: accepted.conversationId,
      replyToEnvelopeId: accepted.envelopeId,
      message: { role: MessageRole.ASSISTANT, content: "world" },
      transport: { externalMessageId: "outbound-1" },
    });
    expect(state.envelopes).toHaveLength(2);
    expect(state.messages).toHaveLength(2);
    expect(state.sessionEnvelopes).toHaveLength(2);
    expect(state.agentRuns.get(required(accepted.runId, "runId"))?.status).toBe(AgentRunStatus.SUCCEEDED);
    expect(state.sessions.get(required(accepted.sessionId, "sessionId"))?.status).toBe(SessionStatus.WAITING_USER);
    expect([...state.outboxEvents.values()][0]?.publishedAt).toEqual(expect.any(Number));
  });

  it("does not execute or publish an already accepted duplicate twice", async () => {
    const store = new MemoryStore();
    const makeUnitOfWork = fakeUnitOfWorkFactory(store);
    const accept = new AcceptIncomingEnvelope(makeUnitOfWork);
    const runtime: AgentRuntime = {
      run: vi.fn(async () => ({ status: "succeeded" as const, text: "answer" })),
    };
    const publisher: MessagePublisher = {
      publish: vi.fn(async (outgoing) => ({
        deliveryId: outgoing.deliveryId,
        externalMessageId: "outbound-1",
        sentAt: nowMs(),
      })),
    };
    const worker = new MemoryOutboxWorker(makeUnitOfWork, runtime, publisher, logger());
    await accept.execute(incoming());
    await worker.drain();
    expect((await accept.execute(incoming())).status).toBe("duplicate");
    await worker.drain();
    expect(runtime.run).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it("marks the run failed when platform delivery fails", async () => {
    const store = new MemoryStore();
    const makeUnitOfWork = fakeUnitOfWorkFactory(store);
    const accepted = await new AcceptIncomingEnvelope(makeUnitOfWork).execute(incoming());
    const runtime: AgentRuntime = { run: async () => ({ status: "succeeded", text: "answer" }) };
    const publisher: MessagePublisher = {
      publish: async () => {
        throw new Error("KOOK unavailable");
      },
    };
    await new MemoryOutboxWorker(makeUnitOfWork, runtime, publisher, logger()).drain();
    const state = store.snapshot();
    expect(state.agentRuns.get(required(accepted.runId, "runId"))?.status).toBe(AgentRunStatus.FAILED);
    expect(state.sessions.get(required(accepted.sessionId, "sessionId"))?.status).toBe(SessionStatus.FAILED);
    expect(state.envelopes).toHaveLength(1);
    expect([...state.outboxEvents.values()][0]?.publishedAt).toEqual(expect.any(Number));
  });
});
