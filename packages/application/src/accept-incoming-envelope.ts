import {
  AgentRun,
  type EntityId,
  type MessageEnvelope,
  type NormalizedIncoming,
  OutboxEvent,
  SessionStatus,
  TransportFlow,
  nowMs,
  unixMillis,
} from "@kookbot/domain";

import { type UnitOfWork, type UnitOfWorkFactory, withUnitOfWork } from "./repositories.js";
import { SessionRouter } from "./session-router.js";

export interface AcceptanceResult {
  readonly status: "accepted" | "duplicate";
  readonly conversationId: EntityId;
  readonly envelopeId: EntityId;
  readonly sessionId?: EntityId;
  readonly runId?: EntityId;
}

export class AcceptIncomingEnvelope {
  readonly #makeUnitOfWork: UnitOfWorkFactory;
  readonly #router: SessionRouter;

  constructor(makeUnitOfWork: UnitOfWorkFactory, router = new SessionRouter()) {
    this.#makeUnitOfWork = makeUnitOfWork;
    this.#router = router;
  }

  async execute(incoming: NormalizedIncoming): Promise<AcceptanceResult> {
    const envelope = incoming.envelope.clone();
    const owner = envelope.sender?.externalId;
    const message = envelope.message;
    if (!owner || !envelope.idempotencyKey || !message) {
      throw new TypeError("sender, idempotencyKey and message are required");
    }
    if (envelope.transportFlow !== TransportFlow.INBOUND) {
      throw new TypeError("only inbound envelopes can be accepted");
    }
    if (!incoming.address.platform || (!incoming.address.roomId && !incoming.address.externalId)) {
      throw new TypeError("a platform and conversation address are required");
    }

    return withUnitOfWork(this.#makeUnitOfWork, async (uow) => {
      const conversation = await uow.conversations.getOrCreateByAddress(incoming.address);
      envelope.conversationId = conversation.id;
      const duplicate = await this.#findDuplicate(uow, envelope);
      if (duplicate) {
        const event = await uow.outbox.getByEnvelope(duplicate.id);
        const run = event ? await uow.agentRuns.get(event.runId) : undefined;
        return {
          status: "duplicate",
          conversationId: conversation.id,
          envelopeId: duplicate.id,
          ...(run?.sessionId === undefined ? {} : { sessionId: run.sessionId }),
          ...(run === undefined ? {} : { runId: run.id }),
        };
      }

      const target = await this.#findReplyTarget(uow, conversation.id, envelope);
      envelope.replyToEnvelopeId = target?.id;

      let session = target ? await this.#findLinkedActiveSession(uow, target.id, conversation.id, owner) : undefined;
      session ??= await uow.sessions.getActive({ conversationId: conversation.id, ownerUserId: owner });
      const route = this.#router.route({
        conversationId: conversation.id,
        ownerUserId: owner,
        ...(session === undefined ? {} : { activeSession: session }),
      });
      if (route.action === "create") {
        session = this.#router.newSession({ conversationId: conversation.id, ownerUserId: owner });
        await uow.sessions.add(session);
      }
      if (!session) {
        throw new Error("session routing did not produce a session");
      }

      await uow.messages.add(message);
      await uow.envelopes.add(envelope);
      await uow.sessionEnvelopes.attach({ sessionId: session.id, envelopeId: envelope.id });
      const existingRuns = await uow.agentRuns.listBySession(session.id);
      const attempt = Math.max(0, ...existingRuns.map((run) => run.attempt)) + 1;
      const run = new AgentRun({ sessionId: session.id, attempt });
      await uow.agentRuns.add(run);
      await uow.outbox.add(new OutboxEvent({ runId: run.id, envelopeId: envelope.id }));

      if (session.status !== SessionStatus.RUNNING) session.status = SessionStatus.QUEUED;
      session.updatedAt = nowMs();
      await uow.sessions.save(session);
      const receivedAt = envelope.receivedAt ?? nowMs();
      conversation.lastMessageAt = unixMillis(Math.max(conversation.lastMessageAt ?? 0, receivedAt));
      await uow.conversations.save(conversation);

      return {
        status: "accepted",
        conversationId: conversation.id,
        envelopeId: envelope.id,
        sessionId: session.id,
        runId: run.id,
      };
    });
  }

  async #findDuplicate(uow: UnitOfWork, envelope: MessageEnvelope) {
    const conversationId = envelope.conversationId;
    if (!conversationId) throw new TypeError("envelope conversationId is required");
    const byKey = await uow.envelopes.getByIdempotencyKey(conversationId, envelope.idempotencyKey ?? "");
    if (byKey) return byKey;
    const externalMessageId = envelope.transport?.externalMessageId;
    return externalMessageId ? uow.envelopes.getByExternalMessageId({ conversationId, externalMessageId }) : undefined;
  }

  async #findReplyTarget(uow: UnitOfWork, conversationId: EntityId, envelope: MessageEnvelope) {
    const externalId = envelope.transport?.externalReplyToMessageId;
    const target = externalId
      ? await uow.envelopes.getByExternalMessageId({ conversationId, externalMessageId: externalId })
      : envelope.replyToEnvelopeId
        ? await uow.envelopes.get(envelope.replyToEnvelopeId)
        : undefined;
    if (target?.conversationId !== undefined && target.conversationId !== conversationId) {
      throw new TypeError("reply target belongs to another conversation");
    }
    return target;
  }

  async #findLinkedActiveSession(uow: UnitOfWork, envelopeId: EntityId, conversationId: EntityId, owner: string) {
    for (const sessionId of await uow.sessionEnvelopes.listSessionIds(envelopeId)) {
      const candidate = await uow.sessions.get(sessionId);
      if (candidate?.conversationId === conversationId && candidate.ownerUserId === owner && candidate.isActive()) {
        return candidate;
      }
    }
    return undefined;
  }
}
