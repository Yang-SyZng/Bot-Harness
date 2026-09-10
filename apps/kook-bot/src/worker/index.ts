import {
  ExecuteAgentRun,
  type AgentRuntime,
  type Logger,
  type MessagePublisher,
  withUnitOfWork,
} from "@kookbot/application";
import {
  AgentRunStatus,
  type ConversationAddress,
  Message,
  MessageEnvelope,
  MessageEnvelopeDirection,
  MessageRole,
  SessionEnvelopeRole,
  SessionStatus,
  TransportFlow,
  TransportRef,
  nowMs,
  type EntityId,
  type OutboxEvent,
} from "@kookbot/domain";
import type { UnitOfWorkFactory } from "@kookbot/application";

export const WORKER_COMPONENT = "worker" as const;

interface WorkItem {
  readonly runId: EntityId;
  readonly sessionId: EntityId;
  readonly inbound: MessageEnvelope;
  readonly current: Message;
  readonly history: Message[];
  readonly address: ConversationAddress;
}

export class MemoryOutboxWorker {
  #draining: Promise<void> | undefined;

  constructor(
    private readonly makeUnitOfWork: UnitOfWorkFactory,
    private readonly runtime: AgentRuntime,
    private readonly publisher: MessagePublisher,
    private readonly logger: Logger,
  ) {}

  drain(): Promise<void> {
    this.#draining ??= this.#drain().finally(() => {
      this.#draining = undefined;
    });
    return this.#draining;
  }

  async #drain(): Promise<void> {
    while (true) {
      const events = await withUnitOfWork(this.makeUnitOfWork, (uow) => uow.outbox.listPending(1));
      const event = events[0];
      if (!event) return;
      try {
        await this.#process(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error("outbox.event_failed", { eventId: event.id, runId: event.runId, error: message });
        await this.#settleFailure(event, message);
      }
    }
  }

  async #load(event: OutboxEvent): Promise<WorkItem> {
    return withUnitOfWork(this.makeUnitOfWork, async (uow) => {
      const run = await uow.agentRuns.get(event.runId);
      if (!run?.sessionId) throw new Error(`outbox run ${event.runId} is missing`);
      const session = await uow.sessions.get(run.sessionId);
      if (!session?.conversationId) throw new Error(`run session ${run.sessionId} is missing`);
      const inbound = await uow.envelopes.get(event.envelopeId);
      if (!inbound?.message) throw new Error(`outbox envelope ${event.envelopeId} is missing`);
      const conversation = await uow.conversations.get(session.conversationId);
      if (!conversation?.address) throw new Error(`conversation ${session.conversationId} has no address`);
      const history: Message[] = [];
      for (const relation of await uow.sessionEnvelopes.listBySession(session.id)) {
        if (relation.envelopeId === inbound.id) continue;
        const envelope = await uow.envelopes.get(relation.envelopeId);
        if (envelope?.message) history.push(envelope.message);
      }
      return {
        runId: run.id,
        sessionId: session.id,
        inbound,
        current: inbound.message,
        history,
        address: conversation.address,
      };
    });
  }

  async #process(event: OutboxEvent): Promise<void> {
    const work = await this.#load(event);
    const result = await new ExecuteAgentRun(this.makeUnitOfWork, this.runtime).execute({
      runId: work.runId,
      history: work.history,
      current: work.current,
      onEvent: (runtimeEvent) => {
        if (runtimeEvent.type === "text_delta") return;
        this.logger.debug("agent.runtime_event", { runId: work.runId, runtimeEvent });
      },
    });
    if (result.status !== "succeeded") {
      await withUnitOfWork(this.makeUnitOfWork, (uow) => uow.outbox.markPublished(event.id, nowMs()));
      this.logger.warn("agent.run_not_delivered", { runId: work.runId, status: result.status });
      return;
    }

    const outgoingMessage = new Message({ role: MessageRole.ASSISTANT, content: result.text });
    const receipt = await this.publisher.publish({
      deliveryId: work.runId,
      message: outgoingMessage,
      address: work.address,
      ...(work.inbound.transport?.externalMessageId === undefined
        ? {}
        : { externalReplyToMessageId: work.inbound.transport.externalMessageId }),
    });
    await withUnitOfWork(this.makeUnitOfWork, async (uow) => {
      const outbound = new MessageEnvelope({
        conversationId: work.inbound.conversationId,
        message: outgoingMessage,
        recipient: work.inbound.sender,
        replyToEnvelopeId: work.inbound.id,
        transport: new TransportRef({ externalMessageId: receipt.externalMessageId }),
        direction: MessageEnvelopeDirection.B2P,
        transportFlow: TransportFlow.OUTBOUND,
        occurredAt: receipt.sentAt,
        receivedAt: receipt.sentAt,
        idempotencyKey: `kook:out:${receipt.externalMessageId}`,
      });
      await uow.messages.add(outgoingMessage);
      await uow.envelopes.add(outbound);
      await uow.sessionEnvelopes.attach({
        sessionId: work.sessionId,
        envelopeId: outbound.id,
        relationRole: SessionEnvelopeRole.OUTPUT,
      });
      const session = await uow.sessions.get(work.sessionId);
      if (!session) throw new Error(`session ${work.sessionId} disappeared`);
      session.advanceThrough(outbound.id);
      session.updatedAt = nowMs();
      await uow.sessions.save(session);
      await uow.outbox.markPublished(event.id, receipt.sentAt ?? nowMs());
    });
    this.logger.info("agent.reply_delivered", {
      runId: work.runId,
      externalMessageIds: receipt.externalMessageIds ?? [receipt.externalMessageId],
    });
  }

  async #settleFailure(event: OutboxEvent, message: string): Promise<void> {
    await withUnitOfWork(this.makeUnitOfWork, async (uow) => {
      const run = await uow.agentRuns.get(event.runId);
      if (run) {
        run.status = AgentRunStatus.FAILED;
        run.completedAt = nowMs();
        await uow.agentRuns.save(run);
        if (run.sessionId) {
          const session = await uow.sessions.get(run.sessionId);
          if (session) {
            session.status = SessionStatus.FAILED;
            session.updatedAt = nowMs();
            await uow.sessions.save(session);
          }
        }
      }
      await uow.outbox.markPublished(event.id, nowMs());
    });
    this.logger.warn("outbox.event_terminal", { eventId: event.id, error: message });
  }
}
