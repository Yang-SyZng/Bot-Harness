import type { UnitOfWork } from "@kookbot/application";

import {
  MemoryAgentRunRepository,
  MemoryAssetRepository,
  MemoryConversationRepository,
  MemoryEnvelopeRepository,
  MemoryMessageRepository,
  MemoryOutboxRepository,
  MemorySessionEnvelopeRepository,
  MemorySessionRepository,
} from "./repositories.js";
import type { MemoryState, MemoryStore } from "./store.js";

export class FakeUnitOfWork implements UnitOfWork {
  #state: MemoryState | undefined;
  #release: (() => void) | undefined;

  conversations!: MemoryConversationRepository;
  envelopes!: MemoryEnvelopeRepository;
  messages!: MemoryMessageRepository;
  sessions!: MemorySessionRepository;
  sessionEnvelopes!: MemorySessionEnvelopeRepository;
  assets!: MemoryAssetRepository;
  agentRuns!: MemoryAgentRunRepository;
  outbox!: MemoryOutboxRepository;

  constructor(readonly store: MemoryStore) {}

  async begin(): Promise<void> {
    if (this.#state) throw new Error("unit of work already started");
    this.#release = await this.store.mutex.acquire();
    this.#state = this.store.snapshot();
    this.conversations = new MemoryConversationRepository(this.#state);
    this.envelopes = new MemoryEnvelopeRepository(this.#state);
    this.messages = new MemoryMessageRepository(this.#state);
    this.sessions = new MemorySessionRepository(this.#state);
    this.sessionEnvelopes = new MemorySessionEnvelopeRepository(this.#state);
    this.assets = new MemoryAssetRepository(this.#state);
    this.agentRuns = new MemoryAgentRunRepository(this.#state);
    this.outbox = new MemoryOutboxRepository(this.#state);
  }

  async commit(): Promise<void> {
    if (!this.#state) throw new Error("unit of work has not started");
    this.store.publish(this.#state);
    this.#state = undefined;
  }

  async rollback(): Promise<void> {
    this.#state = undefined;
  }

  async close(): Promise<void> {
    this.#state = undefined;
    this.#release?.();
    this.#release = undefined;
  }
}

export function fakeUnitOfWorkFactory(store: MemoryStore): () => FakeUnitOfWork {
  return () => new FakeUnitOfWork(store);
}
