import {
  Conversation,
  SessionEnvelope,
  SessionEnvelopeRole,
  type AgentRun,
  type Asset,
  type ConversationAddress,
  type EntityId,
  type Message,
  type MessageEnvelope,
  type OutboxEvent,
  type Session,
  type UnixMillis,
  nowMs,
} from "@kookbot/domain";
import type {
  AgentRunRepository,
  AssetRepository,
  ConversationRepository,
  EnvelopeRepository,
  MessageRepository,
  OutboxRepository,
  SessionEnvelopeRepository,
  SessionRepository,
} from "@kookbot/application";

import type { MemoryState } from "./store.js";

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new TypeError(message);
  return value;
}

export class MemoryConversationRepository implements ConversationRepository {
  constructor(private readonly state: MemoryState) {}

  async add(conversation: Conversation): Promise<void> {
    if (this.state.conversations.has(conversation.id))
      throw new Error(`conversation ${conversation.id} already exists`);
    const address = required(conversation.address, "conversation address is required");
    const key = address.identityKey();
    if (this.state.conversationIdsByAddress.has(key)) throw new Error("conversation address already exists");
    this.state.conversations.set(conversation.id, conversation.clone());
    this.state.conversationIdsByAddress.set(key, conversation.id);
  }

  async get(conversationId: EntityId): Promise<Conversation | undefined> {
    return this.state.conversations.get(conversationId)?.clone();
  }

  async getOrCreateByAddress(address: ConversationAddress): Promise<Conversation> {
    const key = address.identityKey();
    const existingId = this.state.conversationIdsByAddress.get(key);
    if (existingId)
      return required(this.state.conversations.get(existingId), "conversation address index is corrupt").clone();
    const conversation = new Conversation({ address });
    await this.add(conversation);
    return conversation.clone();
  }

  async save(conversation: Conversation): Promise<void> {
    if (!this.state.conversations.has(conversation.id))
      throw new Error(`conversation ${conversation.id} does not exist`);
    const previous = required(this.state.conversations.get(conversation.id), "conversation is missing");
    const previousKey = previous.address?.identityKey();
    const nextAddress = required(conversation.address, "conversation address is required");
    const nextKey = nextAddress.identityKey();
    const owner = this.state.conversationIdsByAddress.get(nextKey);
    if (owner !== undefined && owner !== conversation.id) throw new Error("conversation address already exists");
    if (previousKey !== undefined && previousKey !== nextKey) this.state.conversationIdsByAddress.delete(previousKey);
    this.state.conversationIdsByAddress.set(nextKey, conversation.id);
    this.state.conversations.set(conversation.id, conversation.clone());
  }
}

export class MemoryMessageRepository implements MessageRepository {
  constructor(private readonly state: MemoryState) {}
  async add(message: Message): Promise<void> {
    if (this.state.messages.has(message.id)) throw new Error(`message ${message.id} already exists`);
    this.state.messages.set(message.id, message.clone());
  }
  async get(messageId: EntityId): Promise<Message | undefined> {
    return this.state.messages.get(messageId)?.clone();
  }
}

export class MemoryEnvelopeRepository implements EnvelopeRepository {
  constructor(private readonly state: MemoryState) {}

  async add(envelope: MessageEnvelope): Promise<void> {
    if (this.state.envelopes.has(envelope.id)) throw new Error(`envelope ${envelope.id} already exists`);
    const conversationId = required(envelope.conversationId, "envelope conversationId is required");
    if (envelope.idempotencyKey && (await this.getByIdempotencyKey(conversationId, envelope.idempotencyKey))) {
      throw new Error("envelope idempotency key already exists");
    }
    const externalMessageId = envelope.transport?.externalMessageId;
    if (externalMessageId && (await this.getByExternalMessageId({ conversationId, externalMessageId }))) {
      throw new Error("external message id already exists");
    }
    this.state.envelopes.set(envelope.id, envelope.clone());
  }

  async get(envelopeId: EntityId): Promise<MessageEnvelope | undefined> {
    return this.state.envelopes.get(envelopeId)?.clone();
  }

  async getByIdempotencyKey(conversationId: EntityId, idempotencyKey: string): Promise<MessageEnvelope | undefined> {
    for (const envelope of this.state.envelopes.values()) {
      if (envelope.conversationId === conversationId && envelope.idempotencyKey === idempotencyKey)
        return envelope.clone();
    }
    return undefined;
  }

  async getByExternalMessageId(input: {
    readonly conversationId: EntityId;
    readonly externalMessageId: string;
  }): Promise<MessageEnvelope | undefined> {
    for (const envelope of this.state.envelopes.values()) {
      if (
        envelope.conversationId === input.conversationId &&
        envelope.transport?.externalMessageId === input.externalMessageId
      ) {
        return envelope.clone();
      }
    }
    return undefined;
  }

  async listByConversation(
    conversationId: EntityId,
    options: { readonly afterEnvelopeId?: EntityId; readonly limit?: number } = {},
  ): Promise<MessageEnvelope[]> {
    let ordered = [...this.state.envelopes.values()]
      .filter((item) => item.conversationId === conversationId)
      .sort((left, right) => left.id.localeCompare(right.id));
    if (options.afterEnvelopeId !== undefined) {
      const afterIndex = ordered.findIndex((item) => item.id === options.afterEnvelopeId);
      ordered = afterIndex < 0 ? [] : ordered.slice(afterIndex + 1);
    }
    if (options.limit !== undefined) ordered = ordered.slice(-options.limit);
    return ordered.map((item) => item.clone());
  }
}

export class MemorySessionRepository implements SessionRepository {
  constructor(private readonly state: MemoryState) {}
  async add(session: Session): Promise<void> {
    if (this.state.sessions.has(session.id)) throw new Error(`session ${session.id} already exists`);
    this.state.sessions.set(session.id, session.clone());
  }
  async get(sessionId: EntityId): Promise<Session | undefined> {
    return this.state.sessions.get(sessionId)?.clone();
  }
  async save(session: Session): Promise<void> {
    if (!this.state.sessions.has(session.id)) throw new Error(`session ${session.id} does not exist`);
    this.state.sessions.set(session.id, session.clone());
  }
  async getActive(input: {
    readonly conversationId: EntityId;
    readonly ownerUserId?: string;
  }): Promise<Session | undefined> {
    return [...this.state.sessions.values()]
      .filter(
        (session) =>
          session.conversationId === input.conversationId &&
          (input.ownerUserId === undefined || session.ownerUserId === input.ownerUserId) &&
          session.isActive(),
      )
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0]
      ?.clone();
  }
  async listByConversation(conversationId: EntityId): Promise<Session[]> {
    return [...this.state.sessions.values()]
      .filter((session) => session.conversationId === conversationId)
      .map((session) => session.clone());
  }
}

export class MemorySessionEnvelopeRepository implements SessionEnvelopeRepository {
  constructor(private readonly state: MemoryState) {}
  async attach(input: {
    readonly sessionId: EntityId;
    readonly envelopeId: EntityId;
    readonly relationRole?: (typeof SessionEnvelopeRole)[keyof typeof SessionEnvelopeRole];
  }): Promise<SessionEnvelope> {
    const session = required(this.state.sessions.get(input.sessionId), `session ${input.sessionId} does not exist`);
    const envelope = required(
      this.state.envelopes.get(input.envelopeId),
      `envelope ${input.envelopeId} does not exist`,
    );
    if (session.conversationId !== envelope.conversationId) {
      throw new TypeError("session and envelope belong to different conversations");
    }
    const key = `${input.sessionId}\0${input.envelopeId}`;
    const existing = this.state.sessionEnvelopes.get(key);
    if (existing) return existing.clone();
    const sequenceNo =
      Math.max(
        0,
        ...[...this.state.sessionEnvelopes.values()]
          .filter((relation) => relation.sessionId === input.sessionId)
          .map((relation) => relation.sequenceNo),
      ) + 1;
    const relation = new SessionEnvelope({
      sessionId: input.sessionId,
      envelopeId: input.envelopeId,
      sequenceNo,
      relationRole: input.relationRole ?? SessionEnvelopeRole.INPUT,
      createdAt: nowMs(),
    });
    this.state.sessionEnvelopes.set(key, relation.clone());
    return relation.clone();
  }
  async listBySession(sessionId: EntityId): Promise<SessionEnvelope[]> {
    return [...this.state.sessionEnvelopes.values()]
      .filter((relation) => relation.sessionId === sessionId)
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map((relation) => relation.clone());
  }
  async listSessionIds(envelopeId: EntityId): Promise<EntityId[]> {
    return [...this.state.sessionEnvelopes.values()]
      .filter((relation) => relation.envelopeId === envelopeId)
      .map((relation) => relation.sessionId);
  }
}

export class MemoryAgentRunRepository implements AgentRunRepository {
  constructor(private readonly state: MemoryState) {}
  async add(run: AgentRun): Promise<void> {
    if (this.state.agentRuns.has(run.id)) throw new Error(`agent run ${run.id} already exists`);
    if (!run.sessionId || !this.state.sessions.has(run.sessionId)) {
      throw new TypeError(`unknown session: ${run.sessionId ?? "undefined"}`);
    }
    this.state.agentRuns.set(run.id, run.clone());
  }
  async get(runId: EntityId): Promise<AgentRun | undefined> {
    return this.state.agentRuns.get(runId)?.clone();
  }
  async save(run: AgentRun): Promise<void> {
    if (!this.state.agentRuns.has(run.id)) throw new Error(`agent run ${run.id} does not exist`);
    this.state.agentRuns.set(run.id, run.clone());
  }
  async listBySession(sessionId: EntityId): Promise<AgentRun[]> {
    return [...this.state.agentRuns.values()]
      .filter((run) => run.sessionId === sessionId)
      .sort((left, right) => left.attempt - right.attempt)
      .map((run) => run.clone());
  }
}

export class MemoryAssetRepository implements AssetRepository {
  constructor(private readonly state: MemoryState) {}
  async add(asset: Asset): Promise<void> {
    if (this.state.assets.has(asset.id)) throw new Error(`asset ${asset.id} already exists`);
    this.state.assets.set(asset.id, asset.clone());
  }
  async get(assetId: EntityId): Promise<Asset | undefined> {
    return this.state.assets.get(assetId)?.clone();
  }
  async listBySha256(sha256: string): Promise<Asset[]> {
    return [...this.state.assets.values()].filter((asset) => asset.sha256 === sha256).map((asset) => asset.clone());
  }
}

export class MemoryOutboxRepository implements OutboxRepository {
  constructor(private readonly state: MemoryState) {}
  async add(event: OutboxEvent): Promise<void> {
    if (this.state.outboxEvents.has(event.id)) throw new Error(`outbox event ${event.id} already exists`);
    if (!this.state.agentRuns.has(event.runId)) throw new TypeError(`unknown agent run: ${event.runId}`);
    if (!this.state.envelopes.has(event.envelopeId)) throw new TypeError(`unknown envelope: ${event.envelopeId}`);
    if (
      [...this.state.outboxEvents.values()].some(
        (item) => item.runId === event.runId || item.envelopeId === event.envelopeId,
      )
    ) {
      throw new Error("duplicate execution event");
    }
    this.state.outboxEvents.set(event.id, event.clone());
  }
  async getByEnvelope(envelopeId: EntityId): Promise<OutboxEvent | undefined> {
    return [...this.state.outboxEvents.values()].find((event) => event.envelopeId === envelopeId)?.clone();
  }
  async listPending(limit = 100): Promise<OutboxEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("limit must be positive");
    return [...this.state.outboxEvents.values()]
      .filter((event) => event.publishedAt === undefined)
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
      .slice(0, limit)
      .map((event) => event.clone());
  }
  async markPublished(eventId: EntityId, publishedAt: UnixMillis): Promise<void> {
    const event = required(this.state.outboxEvents.get(eventId), `outbox event ${eventId} does not exist`);
    if (event.publishedAt === undefined) this.state.outboxEvents.set(eventId, event.withPublishedAt(publishedAt));
  }
}
