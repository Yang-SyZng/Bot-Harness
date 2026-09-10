import { resolve } from "node:path";

import { digestFile } from "./file-digest.js";
import type { ActorRef, Attachment, ConversationAddress, EnvelopeTransportFields, TransportRef } from "./transport.js";
import {
  AgentRunStatus,
  type ConversationType,
  type EntityId,
  type MessageEnvelopeDirection,
  type MessageRole,
  type SessionEnvelopeRole,
  SessionStatus,
  type TransportFlow,
  type UnixMillis,
  newId,
  nowMs,
} from "./values.js";

export interface MessageInit {
  readonly id?: EntityId;
  readonly role?: MessageRole | undefined;
  readonly content?: string | undefined;
  readonly attachments?: readonly Attachment[] | undefined;
}

export class Message {
  readonly id: EntityId;
  role: MessageRole | undefined;
  content: string | undefined;
  attachments: Attachment[];

  constructor(init: MessageInit = {}) {
    this.id = init.id ?? newId();
    this.role = init.role;
    this.content = init.content;
    this.attachments = init.attachments?.map((attachment) => attachment.clone()) ?? [];
  }

  clone(): Message {
    return new Message(this);
  }
}

export interface MessageEnvelopeInit extends EnvelopeTransportFields {
  readonly version?: string;
  readonly id?: EntityId;
  readonly conversationId?: EntityId | undefined;
  readonly message?: Message | undefined;
  readonly replyToEnvelopeId?: EntityId | undefined;
  readonly idempotencyKey?: string | undefined;
}

export class MessageEnvelope {
  readonly version: string;
  readonly id: EntityId;
  conversationId: EntityId | undefined;
  message: Message | undefined;
  sender: ActorRef | undefined;
  recipient: ActorRef | undefined;
  replyToEnvelopeId: EntityId | undefined;
  transport: TransportRef | undefined;
  direction: MessageEnvelopeDirection | undefined;
  transportFlow: TransportFlow | undefined;
  occurredAt: UnixMillis | undefined;
  receivedAt: UnixMillis | undefined;
  idempotencyKey: string | undefined;

  constructor(init: MessageEnvelopeInit = {}) {
    this.version = init.version ?? "v0.1";
    this.id = init.id ?? newId();
    this.conversationId = init.conversationId;
    this.message = init.message?.clone();
    this.sender = init.sender?.clone();
    this.recipient = init.recipient?.clone();
    this.replyToEnvelopeId = init.replyToEnvelopeId;
    this.transport = init.transport?.clone();
    this.direction = init.direction;
    this.transportFlow = init.transportFlow;
    this.occurredAt = init.occurredAt;
    this.receivedAt = init.receivedAt;
    this.idempotencyKey = init.idempotencyKey;
  }

  clone(): MessageEnvelope {
    return new MessageEnvelope(this);
  }
}

export interface ConversationInit {
  readonly id?: EntityId;
  readonly conversationType?: ConversationType | undefined;
  readonly address?: ConversationAddress | undefined;
  readonly parentId?: EntityId | undefined;
  readonly createdAt?: UnixMillis | undefined;
  readonly lastMessageAt?: UnixMillis | undefined;
}

export class Conversation {
  readonly id: EntityId;
  conversationType: ConversationType | undefined;
  address: ConversationAddress | undefined;
  parentId: EntityId | undefined;
  createdAt: UnixMillis | undefined;
  lastMessageAt: UnixMillis | undefined;

  constructor(init: ConversationInit = {}) {
    this.id = init.id ?? newId();
    this.conversationType = init.conversationType;
    this.address = init.address?.clone();
    this.parentId = init.parentId;
    this.createdAt = init.createdAt;
    this.lastMessageAt = init.lastMessageAt;
  }

  clone(): Conversation {
    return new Conversation(this);
  }
}

const ACTIVE_SESSION_STATUSES: ReadonlySet<SessionStatus> = new Set([
  SessionStatus.QUEUED,
  SessionStatus.RUNNING,
  SessionStatus.WAITING_USER,
]);

export interface SessionInit {
  readonly id?: EntityId;
  readonly conversationId?: EntityId | undefined;
  readonly ownerUserId?: string | undefined;
  readonly parentSessionId?: EntityId | undefined;
  readonly coversThroughEnvelopeId?: EntityId | undefined;
  readonly goal?: string | undefined;
  readonly status?: SessionStatus | undefined;
  readonly summary?: string | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly version?: number | undefined;
  readonly createdAt?: UnixMillis | undefined;
  readonly updatedAt?: UnixMillis | undefined;
}

export class Session {
  readonly id: EntityId;
  conversationId: EntityId | undefined;
  ownerUserId: string | undefined;
  parentSessionId: EntityId | undefined;
  coversThroughEnvelopeId: EntityId | undefined;
  goal: string | undefined;
  status: SessionStatus | undefined;
  summary: string | undefined;
  idempotencyKey: string | undefined;
  version: number | undefined;
  createdAt: UnixMillis | undefined;
  updatedAt: UnixMillis | undefined;

  constructor(init: SessionInit = {}) {
    this.id = init.id ?? newId();
    this.conversationId = init.conversationId;
    this.ownerUserId = init.ownerUserId;
    this.parentSessionId = init.parentSessionId;
    this.coversThroughEnvelopeId = init.coversThroughEnvelopeId;
    this.goal = init.goal;
    this.status = init.status;
    this.summary = init.summary;
    this.idempotencyKey = init.idempotencyKey;
    this.version = init.version;
    this.createdAt = init.createdAt;
    this.updatedAt = init.updatedAt;
  }

  advanceThrough(envelopeId: EntityId): void {
    this.coversThroughEnvelopeId = envelopeId;
  }

  isActive(): boolean {
    return this.status !== undefined && ACTIVE_SESSION_STATUSES.has(this.status);
  }

  canResume(): boolean {
    return this.status === SessionStatus.PAUSED;
  }

  clone(): Session {
    return new Session(this);
  }
}

export interface SessionEnvelopeInit {
  readonly sessionId: EntityId;
  readonly envelopeId: EntityId;
  readonly sequenceNo: number;
  readonly relationRole?: SessionEnvelopeRole | undefined;
  readonly createdAt?: UnixMillis | undefined;
}

export class SessionEnvelope {
  readonly sessionId: EntityId;
  readonly envelopeId: EntityId;
  readonly sequenceNo: number;
  readonly relationRole: SessionEnvelopeRole;
  readonly createdAt: UnixMillis | undefined;

  constructor(init: SessionEnvelopeInit) {
    this.sessionId = init.sessionId;
    this.envelopeId = init.envelopeId;
    this.sequenceNo = init.sequenceNo;
    this.relationRole = init.relationRole ?? "input";
    this.createdAt = init.createdAt;
  }

  clone(): SessionEnvelope {
    return new SessionEnvelope(this);
  }
}

export interface AgentRunInit {
  readonly id?: EntityId;
  readonly sessionId?: EntityId | undefined;
  readonly attempt?: number | undefined;
  readonly status?: AgentRunStatus | undefined;
  readonly backend?: string | undefined;
  readonly model?: string | undefined;
  readonly workerId?: string | undefined;
  readonly startedAt?: UnixMillis | undefined;
  readonly completedAt?: UnixMillis | undefined;
}

export class AgentRun {
  readonly id: EntityId;
  sessionId: EntityId | undefined;
  attempt: number;
  status: AgentRunStatus;
  backend: string | undefined;
  model: string | undefined;
  workerId: string | undefined;
  startedAt: UnixMillis | undefined;
  completedAt: UnixMillis | undefined;

  constructor(init: AgentRunInit = {}) {
    this.id = init.id ?? newId();
    this.sessionId = init.sessionId;
    this.attempt = init.attempt ?? 1;
    this.status = init.status ?? AgentRunStatus.QUEUED;
    this.backend = init.backend;
    this.model = init.model;
    this.workerId = init.workerId;
    this.startedAt = init.startedAt;
    this.completedAt = init.completedAt;
  }

  clone(): AgentRun {
    return new AgentRun(this);
  }
}

export interface OutboxEventInit {
  readonly runId: EntityId;
  readonly envelopeId: EntityId;
  readonly id?: EntityId;
  readonly eventType?: string;
  readonly createdAt?: UnixMillis;
  readonly publishedAt?: UnixMillis | undefined;
}

export class OutboxEvent {
  readonly runId: EntityId;
  readonly envelopeId: EntityId;
  readonly id: EntityId;
  readonly eventType: string;
  readonly createdAt: UnixMillis;
  readonly publishedAt: UnixMillis | undefined;

  constructor(init: OutboxEventInit) {
    this.runId = init.runId;
    this.envelopeId = init.envelopeId;
    this.id = init.id ?? newId();
    this.eventType = init.eventType ?? "agent_run.requested";
    this.createdAt = init.createdAt ?? nowMs();
    this.publishedAt = init.publishedAt;
  }

  withPublishedAt(publishedAt: UnixMillis): OutboxEvent {
    return new OutboxEvent({ ...this, publishedAt });
  }

  clone(): OutboxEvent {
    return new OutboxEvent(this);
  }
}

export interface AssetInit {
  readonly id?: EntityId;
  readonly originalName?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly size?: number | undefined;
  readonly sha256?: string | undefined;
  readonly source?: string | undefined;
  readonly storageKey?: string | undefined;
  readonly localPath?: string | undefined;
  readonly safeToShare?: boolean | undefined;
  readonly status?: string | undefined;
  readonly createdAt?: UnixMillis | undefined;
}

export class Asset {
  readonly id: EntityId;
  originalName: string | undefined;
  mimeType: string | undefined;
  size: number | undefined;
  sha256: string | undefined;
  source: string;
  storageKey: string | undefined;
  localPath: string | undefined;
  safeToShare: boolean;
  status: string;
  createdAt: UnixMillis | undefined;

  constructor(init: AssetInit = {}) {
    this.id = init.id ?? newId();
    this.originalName = init.originalName;
    this.mimeType = init.mimeType;
    this.size = init.size;
    this.sha256 = init.sha256;
    this.source = init.source ?? "agent_generated";
    this.storageKey = init.storageKey;
    this.localPath = init.localPath;
    this.safeToShare = init.safeToShare ?? false;
    this.status = init.status ?? "ready";
    this.createdAt = init.createdAt;
  }

  get name(): string | undefined {
    return this.originalName;
  }

  static async fromLocal(
    path: string,
    options: {
      readonly name: string;
      readonly mimeType: string;
      readonly source?: string | undefined;
      readonly safeToShare?: boolean | undefined;
    },
  ): Promise<Asset> {
    const digest = await digestFile(path);
    return new Asset({
      originalName: options.name,
      mimeType: options.mimeType,
      size: digest.size,
      sha256: digest.sha256,
      source: options.source,
      localPath: resolve(path),
      safeToShare: options.safeToShare,
      createdAt: nowMs(),
    });
  }

  clone(): Asset {
    return new Asset(this);
  }
}
