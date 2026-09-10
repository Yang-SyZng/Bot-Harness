import type {
  AgentRun,
  Asset,
  Conversation,
  EntityId,
  Message,
  MessageEnvelope,
  OutboxEvent,
  Session,
  SessionEnvelope,
} from "@kookbot/domain";

import { AsyncMutex } from "./mutex.js";

export interface MemoryState {
  readonly conversations: Map<EntityId, Conversation>;
  readonly conversationIdsByAddress: Map<string, EntityId>;
  readonly messages: Map<EntityId, Message>;
  readonly envelopes: Map<EntityId, MessageEnvelope>;
  readonly sessions: Map<EntityId, Session>;
  readonly sessionEnvelopes: Map<string, SessionEnvelope>;
  readonly agentRuns: Map<EntityId, AgentRun>;
  readonly assets: Map<EntityId, Asset>;
  readonly outboxEvents: Map<EntityId, OutboxEvent>;
}

function emptyState(): MemoryState {
  return {
    conversations: new Map(),
    conversationIdsByAddress: new Map(),
    messages: new Map(),
    envelopes: new Map(),
    sessions: new Map(),
    sessionEnvelopes: new Map(),
    agentRuns: new Map(),
    assets: new Map(),
    outboxEvents: new Map(),
  };
}

export function cloneMemoryState(state: MemoryState): MemoryState {
  return {
    conversations: new Map([...state.conversations].map(([id, value]) => [id, value.clone()])),
    conversationIdsByAddress: new Map(state.conversationIdsByAddress),
    messages: new Map([...state.messages].map(([id, value]) => [id, value.clone()])),
    envelopes: new Map([...state.envelopes].map(([id, value]) => [id, value.clone()])),
    sessions: new Map([...state.sessions].map(([id, value]) => [id, value.clone()])),
    sessionEnvelopes: new Map([...state.sessionEnvelopes].map(([id, value]) => [id, value.clone()])),
    agentRuns: new Map([...state.agentRuns].map(([id, value]) => [id, value.clone()])),
    assets: new Map([...state.assets].map(([id, value]) => [id, value.clone()])),
    outboxEvents: new Map([...state.outboxEvents].map(([id, value]) => [id, value.clone()])),
  };
}

export class MemoryStore {
  readonly mutex = new AsyncMutex();
  #state = emptyState();

  snapshot(): MemoryState {
    return cloneMemoryState(this.#state);
  }

  publish(state: MemoryState): void {
    this.#state = cloneMemoryState(state);
  }
}
