import type { Logger } from "@kookbot/application";
import type { NormalizedIncoming } from "@kookbot/domain";
import type { EventEmitter } from "node:events";

import type { KookMessageEvent, KookMessageNormalizer, KookUser } from "./normalizer.js";

type KookListener = Parameters<EventEmitter["on"]>[1];
export interface KookGatewayClient {
  on(event: string, listener: KookListener): unknown;
  off(event: string, listener: KookListener): unknown;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function stopKookClientSafely(client: KookGatewayClient): Promise<void> {
  await client.stop();
}

export class KookGateway {
  #botUserId: string | undefined;
  #started = false;
  readonly #listeners: Array<{ event: string; listener: KookListener }> = [];

  constructor(
    private readonly client: KookGatewayClient,
    private readonly normalizer: KookMessageNormalizer,
    private readonly handleIncoming: (incoming: NormalizedIncoming) => Promise<void>,
    private readonly logger: Logger,
  ) {}

  #listen(event: string, listener: KookListener): void {
    this.#listeners.push({ event, listener });
    this.client.on(event, listener);
  }

  async start(): Promise<void> {
    if (this.#started) return;
    this.#listen("ready", ((user: KookUser) => {
      this.#botUserId = user.id;
      this.logger.info("kook.gateway.ready", { botUserId: user.id, username: user.username });
    }) as KookListener);
    this.#listen("stopped", (() => this.logger.info("kook.gateway.stopped")) as KookListener);
    this.#listen("disconnected", ((detail: unknown) => {
      this.logger.warn("kook.gateway.disconnected", { detail });
    }) as KookListener);
    this.#listen("reconnecting", ((detail: unknown) => {
      this.logger.info("kook.gateway.reconnecting", { detail });
    }) as KookListener);
    this.#listen("reconnectFailed", ((error: unknown) => {
      this.logger.error("kook.gateway.reconnect_exhausted", {
        error: error instanceof Error ? error.message : String(error),
      });
    }) as KookListener);
    this.#listen("error", ((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Max reconnect attempts"))
        this.logger.error("kook.gateway.reconnect_exhausted", { error: message });
      else this.logger.error("kook.gateway.error", { error: message });
    }) as KookListener);
    this.#listen("debug", ((message: unknown) => {
      const detail = String(message);
      if (detail.includes("WebSocket closed")) this.logger.warn("kook.gateway.disconnected", { detail });
      else if (detail.includes("Reconnect")) this.logger.info("kook.gateway.reconnecting", { detail });
      else this.logger.debug("kook.gateway.debug", { detail });
    }) as KookListener);
    this.#listen("messageCreate", ((event: KookMessageEvent) => {
      const botUserId = this.#botUserId;
      if (!botUserId) return;
      const incoming = this.normalizer.normalize(event, botUserId);
      if (!incoming) return;
      void this.handleIncoming(incoming).catch((error: unknown) => {
        this.logger.error("kook.ingress.failed", {
          error: error instanceof Error ? error.message : String(error),
          externalMessageId: event.msg_id,
        });
      });
    }) as KookListener);
    try {
      await this.client.start();
      this.#started = true;
    } catch (error) {
      this.#removeListeners();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.#started) return;
    try {
      await stopKookClientSafely(this.client);
    } finally {
      this.#started = false;
      this.#botUserId = undefined;
      this.#removeListeners();
    }
  }

  #removeListeners(): void {
    for (const { event, listener } of this.#listeners) this.client.off(event, listener);
    this.#listeners.length = 0;
  }
}
