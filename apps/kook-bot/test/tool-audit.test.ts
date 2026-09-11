import { AcceptIncomingEnvelope } from "@kookbot/application";
import {
  ActorRef,
  AgentRunStepStatus,
  BotPlatform,
  ConversationAddress,
  Message,
  MessageEnvelope,
  MessageRole,
  ToolRisk,
  TransportFlow,
  TransportRef,
  type NormalizedIncoming,
} from "@kookbot/domain";
import { MemoryStore, fakeUnitOfWorkFactory } from "@kookbot/persistence";
import { describe, expect, it } from "vitest";

import { createToolAuditSink } from "../src/tool-audit.js";

function incoming(): NormalizedIncoming {
  return {
    address: new ConversationAddress({ platform: BotPlatform.KOOK, externalId: "user-a" }),
    envelope: new MessageEnvelope({
      message: new Message({ role: MessageRole.USER, content: "hello" }),
      sender: new ActorRef({ externalId: "user-a" }),
      transport: new TransportRef({ externalMessageId: "incoming-a" }),
      transportFlow: TransportFlow.INBOUND,
      idempotencyKey: "kook:incoming-a",
    }),
  };
}

describe("tool audit", () => {
  it("persists a traceable AgentRunStep lifecycle", async () => {
    const store = new MemoryStore();
    const makeUnitOfWork = fakeUnitOfWorkFactory(store);
    const accepted = await new AcceptIncomingEnvelope(makeUnitOfWork).execute(incoming());
    if (!accepted.runId || !accepted.sessionId) throw new Error("run was not created");
    const audit = createToolAuditSink(makeUnitOfWork);

    await audit.started({
      runId: accepted.runId,
      sessionId: accepted.sessionId,
      toolCallId: "call-a",
      toolName: "get_current_time",
      risk: ToolRisk.READ_ONLY,
      argumentsJson: "{}",
    });
    await audit.finished({
      runId: accepted.runId,
      toolCallId: "call-a",
      status: "succeeded",
      resultText: '{"iso":"2026-09-11T00:00:00.000Z"}',
    });

    expect([...store.snapshot().agentRunSteps.values()]).toEqual([
      expect.objectContaining({
        runId: accepted.runId,
        sessionId: accepted.sessionId,
        toolCallId: "call-a",
        toolName: "get_current_time",
        status: AgentRunStepStatus.SUCCEEDED,
        completedAt: expect.any(Number),
      }),
    ]);
  });
});
