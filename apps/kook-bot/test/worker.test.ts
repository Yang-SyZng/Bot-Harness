import { AcceptIncomingEnvelope, type AgentRuntime, type Logger, type MessagePublisher } from "@kookbot/application";
import {
  ActorRef,
  AgentRunStatus,
  Attachment,
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
import { LocalAssetStore } from "@kookbot/storage";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
        expect(input.history).toHaveLength(1);
        expect(input.history[0]).toMatchObject({ role: MessageRole.SYSTEM });
        expect(input.history[0]?.content).toContain("shared channel");
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

  it("injects direct-message context without persisting it", async () => {
    const store = new MemoryStore();
    const makeUnitOfWork = fakeUnitOfWorkFactory(store);
    const direct = incoming();
    const accepted = await new AcceptIncomingEnvelope(makeUnitOfWork).execute({
      ...direct,
      address: new ConversationAddress({ platform: BotPlatform.KOOK, externalId: "user-1" }),
    });
    const runtime: AgentRuntime = {
      run: vi.fn(async (input) => {
        expect(input.history[0]).toMatchObject({ role: MessageRole.SYSTEM });
        expect(input.history[0]?.content).toContain("direct-message");
        return { status: "succeeded" as const, text: "answer" };
      }),
    };
    const publisher: MessagePublisher = {
      publish: vi.fn(async (outgoing) => ({
        deliveryId: outgoing.deliveryId,
        externalMessageId: "direct-outbound-1",
        sentAt: nowMs(),
      })),
    };

    await new MemoryOutboxWorker(makeUnitOfWork, runtime, publisher, logger()).drain();

    const state = store.snapshot();
    expect(state.messages).toHaveLength(2);
    expect([...state.messages.values()].some((message) => message.role === MessageRole.SYSTEM)).toBe(false);
    expect(state.agentRuns.get(required(accepted.runId, "runId"))?.status).toBe(AgentRunStatus.SUCCEEDED);
  });

  it("publishes only explicitly safe tool progress before the final reply", async () => {
    const store = new MemoryStore();
    const makeUnitOfWork = fakeUnitOfWorkFactory(store);
    await new AcceptIncomingEnvelope(makeUnitOfWork).execute(incoming());
    const runtime: AgentRuntime = {
      run: vi.fn(async (input) => {
        await input.onEvent?.({
          type: "tool_start",
          callId: "call-a",
          name: "read_input_file",
          arguments: { assetId: "must-not-be-published" },
          safeProgressText: "Reading the uploaded file...",
        });
        return { status: "succeeded" as const, text: "done" };
      }),
    };
    const delivered: OutgoingMessage[] = [];
    const publisher: MessagePublisher = {
      publish: vi.fn(async (outgoing) => {
        delivered.push(outgoing);
        return { deliveryId: outgoing.deliveryId, externalMessageId: `out-${delivered.length}`, sentAt: nowMs() };
      }),
    };

    await new MemoryOutboxWorker(makeUnitOfWork, runtime, publisher, logger()).drain();

    expect(delivered.map((item) => item.message.content)).toEqual(["Reading the uploaded file...", "done"]);
    expect(JSON.stringify(delivered)).not.toContain("must-not-be-published");
  });

  it("downloads input files and publishes artifacts created by the run", async () => {
    const root = await mkdtemp(join(tmpdir(), "kookbot-worker-files-"));
    try {
      const store = new MemoryStore();
      const makeUnitOfWork = fakeUnitOfWorkFactory(store);
      const payload = incoming();
      payload.envelope.message?.attachments.push(
        new Attachment({
          name: "question.txt",
          sourceUrl: "https://example.com/question.txt",
          mimeType: "text/plain",
          size: 8,
        }),
      );
      const accepted = await new AcceptIncomingEnvelope(makeUnitOfWork).execute(payload);
      const assetStore = new LocalAssetStore({
        root,
        makeUnitOfWork,
        maxAttachmentBytes: 100,
        maxArtifactBytes: 100,
        fetch: async () => new Response("question"),
      });
      const runtime: AgentRuntime = {
        run: vi.fn(async (input) => {
          const sessionId = required(input.sessionId, "runtime sessionId");
          const runId = required(input.runId, "runtime runId");
          const [file] = await assetStore.listInputFiles(sessionId);
          expect(await assetStore.readInputFile(sessionId, required(file, "input file").assetId)).toBe("question");
          await assetStore.writeArtifact({ sessionId, runId, name: "answer.txt", content: "answer" });
          return { status: "succeeded" as const, text: "created" };
        }),
      };
      const delivered: OutgoingMessage[] = [];
      const publisher: MessagePublisher = {
        publish: vi.fn(async (outgoing) => {
          delivered.push(outgoing);
          return { deliveryId: outgoing.deliveryId, externalMessageId: "outbound-files", sentAt: nowMs() };
        }),
      };

      await new MemoryOutboxWorker(makeUnitOfWork, runtime, publisher, logger(), assetStore).drain();

      expect(delivered[0]?.message.attachments).toEqual([
        expect.objectContaining({ name: "answer.txt", localPath: expect.stringContaining("answer.txt") }),
      ]);
      expect(store.snapshot().assets).toHaveLength(2);
      const storedReply = [...store.snapshot().messages.values()].find(
        (message) => message.role === MessageRole.ASSISTANT,
      );
      expect(storedReply?.attachments[0]).toMatchObject({ name: "answer.txt", localPath: undefined });
      expect(store.snapshot().agentRuns.get(required(accepted.runId, "runId"))?.status).toBe(AgentRunStatus.SUCCEEDED);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
