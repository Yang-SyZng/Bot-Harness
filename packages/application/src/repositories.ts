import type {
  AgentRun,
  AgentRunStep,
  Asset,
  AssetRole,
  Conversation,
  ConversationAddress,
  EntityId,
  Message,
  MessageEnvelope,
  OutboxEvent,
  Session,
  SessionEnvelope,
  SessionEnvelopeRole,
  UnixMillis,
} from "@kookbot/domain";

export interface ConversationRepository {
  add(conversation: Conversation): Promise<void>;
  get(conversationId: EntityId): Promise<Conversation | undefined>;
  getOrCreateByAddress(address: ConversationAddress): Promise<Conversation>;
  save(conversation: Conversation): Promise<void>;
}

export interface EnvelopeRepository {
  add(envelope: MessageEnvelope): Promise<void>;
  get(envelopeId: EntityId): Promise<MessageEnvelope | undefined>;
  getByIdempotencyKey(conversationId: EntityId, idempotencyKey: string): Promise<MessageEnvelope | undefined>;
  getByExternalMessageId(input: {
    readonly conversationId: EntityId;
    readonly externalMessageId: string;
  }): Promise<MessageEnvelope | undefined>;
  listByConversation(
    conversationId: EntityId,
    options?: { readonly afterEnvelopeId?: EntityId; readonly limit?: number },
  ): Promise<MessageEnvelope[]>;
}

export interface MessageRepository {
  add(message: Message): Promise<void>;
  get(messageId: EntityId): Promise<Message | undefined>;
}

export interface SessionRepository {
  add(session: Session): Promise<void>;
  get(sessionId: EntityId): Promise<Session | undefined>;
  save(session: Session): Promise<void>;
  getActive(input: { readonly conversationId: EntityId; readonly ownerUserId?: string }): Promise<Session | undefined>;
  listByConversation(conversationId: EntityId): Promise<Session[]>;
}

export interface SessionEnvelopeRepository {
  attach(input: {
    readonly sessionId: EntityId;
    readonly envelopeId: EntityId;
    readonly relationRole?: SessionEnvelopeRole;
  }): Promise<SessionEnvelope>;
  listBySession(sessionId: EntityId): Promise<SessionEnvelope[]>;
  listSessionIds(envelopeId: EntityId): Promise<EntityId[]>;
}

export interface AgentRunRepository {
  add(run: AgentRun): Promise<void>;
  get(runId: EntityId): Promise<AgentRun | undefined>;
  save(run: AgentRun): Promise<void>;
  listBySession(sessionId: EntityId): Promise<AgentRun[]>;
}

export interface AgentRunStepRepository {
  add(step: AgentRunStep): Promise<void>;
  get(stepId: EntityId): Promise<AgentRunStep | undefined>;
  save(step: AgentRunStep): Promise<void>;
  listByRun(runId: EntityId): Promise<AgentRunStep[]>;
}

export interface AssetRepository {
  add(asset: Asset): Promise<void>;
  get(assetId: EntityId): Promise<Asset | undefined>;
  save(asset: Asset): Promise<void>;
  listBySha256(sha256: string): Promise<Asset[]>;
  listBySession(sessionId: EntityId, role?: AssetRole): Promise<Asset[]>;
  listByRun(runId: EntityId, role?: AssetRole): Promise<Asset[]>;
}

export interface OutboxRepository {
  add(event: OutboxEvent): Promise<void>;
  getByEnvelope(envelopeId: EntityId): Promise<OutboxEvent | undefined>;
  listPending(limit?: number): Promise<OutboxEvent[]>;
  markPublished(eventId: EntityId, publishedAt: UnixMillis): Promise<void>;
}

export interface UnitOfWork {
  readonly conversations: ConversationRepository;
  readonly envelopes: EnvelopeRepository;
  readonly messages: MessageRepository;
  readonly sessions: SessionRepository;
  readonly sessionEnvelopes: SessionEnvelopeRepository;
  readonly assets: AssetRepository;
  readonly agentRuns: AgentRunRepository;
  readonly agentRunSteps: AgentRunStepRepository;
  readonly outbox: OutboxRepository;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}

export type UnitOfWorkFactory = () => UnitOfWork;

export async function withUnitOfWork<T>(
  factory: UnitOfWorkFactory,
  operation: (uow: UnitOfWork) => Promise<T>,
): Promise<T> {
  const uow = factory();
  await uow.begin();
  try {
    const result = await operation(uow);
    await uow.commit();
    return result;
  } catch (error) {
    await uow.rollback();
    throw error;
  } finally {
    await uow.close();
  }
}
