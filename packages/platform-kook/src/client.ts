import type { Client as KookRestClient, UserData } from "@gedaxin/kook";
// @ts-expect-error @gedaxin/kook exports this runtime subpath but omits its declaration mapping.
import { Client as KookRestClientRuntime } from "@gedaxin/kook/src/client/Client.js";
import { EventEmitter } from "node:events";

import type { KookGatewayClient } from "./gateway.js";
import type { KookMessageEvent, KookUser } from "./normalizer.js";
import type { KookPublishingClient, KookSentMessage } from "./publisher.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 6_000;

interface KookSignal {
  readonly s: number;
  readonly d?: unknown;
  readonly sn?: number;
}

type RestClientConstructor = new (options: { token: string; silent: boolean }) => KookRestClient;
type RestClientInternals = { readonly _handleSigint?: () => void };

export function encodeKookHeartbeat(sequenceNumber: number): string {
  return JSON.stringify({ s: 2, sn: sequenceNumber });
}

function asUser(user: UserData): KookUser {
  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    ...(user.nickname === undefined ? {} : { nickname: user.nickname }),
    ...(user.vip_avatar === undefined ? {} : { vip_avatar: user.vip_avatar }),
    ...(user.bot === undefined ? {} : { bot: user.bot }),
  };
}

async function websocketText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  if (data instanceof Blob) return data.text();
  return String(data);
}

export class KookClientAdapter extends EventEmitter implements KookGatewayClient, KookPublishingClient {
  readonly #rest: KookRestClient;
  #socket: WebSocket | undefined;
  #heartbeatTimer: NodeJS.Timeout | undefined;
  #pongTimer: NodeJS.Timeout | undefined;
  #reconnectTimer: NodeJS.Timeout | undefined;
  #reconnectAttempts = 0;
  #lastSequenceNumber = 0;
  #botUser: KookUser | undefined;
  #stopping = false;
  #started = false;

  constructor(
    token: string,
    private readonly maxReconnectAttempts = 10,
  ) {
    super();
    this.#rest = new (KookRestClientRuntime as unknown as RestClientConstructor)({ token, silent: true });
    const sdkSignalHandler = (this.#rest as KookRestClient & RestClientInternals)._handleSigint;
    if (sdkSignalHandler) process.removeListener("SIGINT", sdkSignalHandler);
  }

  async start(): Promise<void> {
    if (this.#started) return;
    this.#stopping = false;
    this.#botUser = asUser(await this.#rest.services.user.me());
    const gateway = await this.#rest.services.gateway.index({ compress: 0 });
    await this.#connect(gateway.url);
    this.#started = true;
  }

  async stop(): Promise<void> {
    if (this.#stopping) return;
    this.#stopping = true;
    this.#started = false;
    this.#clearTimers();
    const socket = this.#socket;
    this.#socket = undefined;
    if (socket && socket.readyState !== WebSocket.CLOSING && socket.readyState !== WebSocket.CLOSED) {
      socket.close(1000, "Client disconnect");
    }
    await this.#rest.destroy();
    this.emit("stopped");
  }

  async sendTextMessage(targetId: string, content: string, options?: { quote?: string }): Promise<KookSentMessage> {
    const result = await this.#rest.services.message.create({
      type: 1,
      target_id: targetId,
      content,
      ...(options?.quote === undefined ? {} : { quote: options.quote }),
    });
    return { id: result.msg_id };
  }

  async sendDirectTextMessage(
    targetId: string,
    content: string,
    options?: { quote?: string },
  ): Promise<KookSentMessage> {
    const result = await this.#rest.services.directMessage.create({
      type: 1,
      target_id: targetId,
      content,
      ...(options?.quote === undefined ? {} : { quote: options.quote }),
    });
    return { id: result.msg_id };
  }

  async uploadAsset(filePath: string): Promise<{ readonly url: string }> {
    return this.#rest.services.asset.create(filePath);
  }

  async sendFileMessage(targetId: string, assetUrl: string, options?: { quote?: string }): Promise<KookSentMessage> {
    const result = await this.#rest.services.message.create({
      type: 4,
      target_id: targetId,
      content: assetUrl,
      ...(options?.quote === undefined ? {} : { quote: options.quote }),
    });
    return { id: result.msg_id };
  }

  async sendDirectFileMessage(
    targetId: string,
    assetUrl: string,
    options?: { quote?: string },
  ): Promise<KookSentMessage> {
    const result = await this.#rest.services.directMessage.create({
      type: 4,
      target_id: targetId,
      content: assetUrl,
      ...(options?.quote === undefined ? {} : { quote: options.quote }),
    });
    return { id: result.msg_id };
  }

  async #connect(url: string): Promise<void> {
    this.emit("debug", "WebSocket connecting");
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.#socket = socket;
      let ready = false;
      const rejectBeforeReady = (error: Error): void => {
        if (!ready) reject(error);
      };
      socket.addEventListener("message", (event) => {
        void this.#handleMessage(event.data, () => {
          if (ready) return;
          ready = true;
          this.#reconnectAttempts = 0;
          this.#startHeartbeat();
          const user = this.#botUser;
          if (user) this.emit("ready", user);
          resolve();
        });
      });
      socket.addEventListener("error", () => {
        const error = new Error("KOOK WebSocket connection failed");
        this.emit("error", error);
        rejectBeforeReady(error);
      });
      socket.addEventListener("close", (event) => {
        this.#stopHeartbeat();
        if (this.#socket === socket) this.#socket = undefined;
        this.emit("disconnected", { code: event.code, reason: event.reason });
        rejectBeforeReady(new Error(`KOOK WebSocket closed before ready (${event.code})`));
        if (!this.#stopping) this.#scheduleReconnect();
      });
    });
  }

  async #handleMessage(data: unknown, onHello: () => void): Promise<void> {
    let signal: KookSignal;
    try {
      signal = JSON.parse(await websocketText(data)) as KookSignal;
    } catch (error) {
      this.emit("error", new Error(`Invalid KOOK Gateway payload: ${String(error)}`));
      return;
    }
    if (signal.s === 0) {
      if (signal.sn !== undefined) this.#lastSequenceNumber = signal.sn;
      this.emit("messageCreate", signal.d as KookMessageEvent);
      return;
    }
    if (signal.s === 1) {
      const hello = signal.d as { code?: number } | undefined;
      if (hello?.code !== undefined && hello.code !== 0) {
        this.emit("error", new Error(`KOOK Gateway HELLO failed (${hello.code})`));
        this.#socket?.close();
        return;
      }
      this.emit("debug", "WebSocket ready");
      onHello();
      return;
    }
    if (signal.s === 3) {
      if (this.#pongTimer) clearTimeout(this.#pongTimer);
      this.#pongTimer = undefined;
      return;
    }
    if (signal.s === 5) {
      this.emit("debug", "Server requested reconnect");
      this.#socket?.close(1012, "Server requested reconnect");
      return;
    }
    if (signal.s === 6) this.emit("debug", "WebSocket resume acknowledged");
  }

  #startHeartbeat(): void {
    this.#stopHeartbeat();
    this.#heartbeatTimer = setInterval(() => this.#sendPing(), HEARTBEAT_INTERVAL_MS);
  }

  #sendPing(): void {
    const socket = this.#socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(encodeKookHeartbeat(this.#lastSequenceNumber));
    if (this.#pongTimer) clearTimeout(this.#pongTimer);
    this.#pongTimer = setTimeout(() => socket.close(4000, "PONG timeout"), PONG_TIMEOUT_MS);
  }

  #stopHeartbeat(): void {
    if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer);
    if (this.#pongTimer) clearTimeout(this.#pongTimer);
    this.#heartbeatTimer = undefined;
    this.#pongTimer = undefined;
  }

  #clearTimers(): void {
    this.#stopHeartbeat();
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
  }

  #scheduleReconnect(): void {
    if (this.#reconnectTimer || this.#stopping) return;
    this.#reconnectAttempts += 1;
    if (this.#reconnectAttempts > this.maxReconnectAttempts) {
      this.emit("reconnectFailed", new Error("Max reconnect attempts reached"));
      return;
    }
    const delay = Math.min(1000 * 2 ** (this.#reconnectAttempts - 1), 30_000);
    this.emit("reconnecting", { attempt: this.#reconnectAttempts, delay });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      void this.#rest.services.gateway
        .index({ compress: 0 })
        .then((gateway) => this.#connect(gateway.url))
        .catch((error: unknown) => {
          this.emit("error", error);
          this.#scheduleReconnect();
        });
    }, delay);
  }
}
