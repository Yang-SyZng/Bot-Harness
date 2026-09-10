import { EventEmitter } from "node:events";
import type { Logger } from "@kookbot/application";
import { describe, expect, it, vi } from "vitest";
import {
  KookGateway,
  type KookMessageEvent,
  KookMessageNormalizer,
  stopKookClientSafely,
  type KookUser,
} from "../src/index.js";

const botUser = { id: "bot-1", username: "bot" } satisfies KookUser;

class FakeGatewayClient extends EventEmitter {
  readonly start = vi.fn(async () => {
    this.emit("ready", botUser);
  });
  readonly stop = vi.fn(async () => {
    this.emit("stopped");
  });
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

function messageEvent(): KookMessageEvent {
  return {
    channel_type: "PERSON",
    type: 1,
    target_id: "bot-1",
    author_id: "user-1",
    content: "hello",
    msg_id: "m1",
    msg_timestamp: Date.now(),
    nonce: "n1",
    extra: {
      type: 1,
      mention: [],
      mention_all: false,
      mention_roles: [],
      mention_here: false,
      author: { ...botUser, id: "user-1", username: "user", bot: false },
    },
  };
}

describe("KookGateway", () => {
  it("listens for messageCreate and dispatches normalized input", async () => {
    const client = new FakeGatewayClient();
    const handler = vi.fn(async () => {});
    const gateway = new KookGateway(client, new KookMessageNormalizer(), handler, logger());
    await gateway.start();
    client.emit("messageCreate", messageEvent());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await gateway.stop();
    expect(client.start).toHaveBeenCalledOnce();
    expect(client.stop).toHaveBeenCalledOnce();
  });

  it("delegates safe shutdown to the platform client", async () => {
    const client = new FakeGatewayClient();
    await stopKookClientSafely(client);
    expect(client.stop).toHaveBeenCalledOnce();
  });
});
