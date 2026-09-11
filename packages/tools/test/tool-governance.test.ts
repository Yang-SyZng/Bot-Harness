import { defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";
import { ToolRisk, entityId } from "@kookbot/domain";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";

import {
  ToolRegistry,
  createCurrentTimeTool,
  governTools,
  type ToolAuditFinish,
  type ToolAuditSink,
  type ToolAuditStart,
} from "../src/index.js";

interface Hooks {
  toolCall(event: {
    type: "tool_call";
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
  }): Promise<unknown>;
  toolResult(event: {
    type: "tool_result";
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
    content: Array<{ type: "text"; text: string }>;
    details: unknown;
    isError: boolean;
  }): Promise<unknown>;
}

async function loadHooks(extension: InlineExtension): Promise<Hooks> {
  const handlers = new Map<string, (event: never) => Promise<unknown>>();
  const factory = typeof extension === "function" ? extension : extension.factory;
  await factory({
    on: (name: string, handler: (event: never) => Promise<unknown>) => handlers.set(name, handler),
  } as never);
  const toolCall = handlers.get("tool_call");
  const toolResult = handlers.get("tool_result");
  if (!toolCall || !toolResult) throw new Error("governance hooks were not registered");
  return { toolCall, toolResult } as unknown as Hooks;
}

function auditFixture(): { audit: ToolAuditSink; starts: ToolAuditStart[]; finishes: ToolAuditFinish[] } {
  const starts: ToolAuditStart[] = [];
  const finishes: ToolAuditFinish[] = [];
  return {
    starts,
    finishes,
    audit: {
      started: async (input) => void starts.push(input),
      finished: async (input) => void finishes.push(input),
    },
  };
}

const context = { runId: entityId("run-a"), sessionId: entityId("session-a") };

describe("ToolRegistry", () => {
  it("combines static and session-scoped tools and rejects collisions", async () => {
    const registry = new ToolRegistry().registerStatic(createCurrentTimeTool(() => new Date("2026-09-11T00:00:00Z")));
    registry.registerSession(() => [
      {
        risk: ToolRisk.READ_ONLY,
        definition: defineTool({
          name: "session_profile",
          label: "Session profile",
          description: "Return the current session id",
          parameters: Type.Object({}),
          execute: async () => ({ content: [{ type: "text", text: context.sessionId }], details: {} }),
        }),
      },
    ]);
    const tools = await registry.resolve(context);
    expect(tools.map((tool) => tool.definition.name)).toEqual(["get_current_time", "session_profile"]);
    const result = await tools[0]?.definition.execute("call", {}, undefined, undefined, {} as never);
    expect(result?.content).toEqual([{ type: "text", text: '{"iso":"2026-09-11T00:00:00.000Z"}' }]);

    registry.registerSession(() => [createCurrentTimeTool()]);
    await expect(registry.resolve(context)).rejects.toThrow("registered more than once");
  });
});

describe("tool governance", () => {
  it("blocks disallowed risks and the per-run call limit while redacting audit input", async () => {
    const fixture = auditFixture();
    const tool = {
      risk: ToolRisk.EXTERNAL_SIDE_EFFECT,
      definition: defineTool({
        name: "send_external",
        label: "Send external",
        description: "External effect",
        parameters: Type.Object({ token: Type.String(), value: Type.String() }),
        execute: vi.fn(async () => ({ content: [{ type: "text" as const, text: "sent" }], details: {} })),
      }),
    };
    const governed = governTools(
      [tool],
      context,
      { allowedRisks: new Set([ToolRisk.READ_ONLY]), maxCallsPerRun: 1, timeoutMs: 100, maxResultCharacters: 100 },
      fixture.audit,
    );
    const hooks = await loadHooks(governed.extensions[0] as InlineExtension);
    const blocked = await hooks.toolCall({
      type: "tool_call",
      toolCallId: "call-1",
      toolName: "send_external",
      input: { token: "secret-value", value: "hello" },
    });
    expect(blocked).toMatchObject({ block: true, reason: expect.stringContaining("TOOL_RISK_BLOCKED") });
    expect(fixture.starts[0]?.argumentsJson).not.toContain("secret-value");
    expect(fixture.finishes[0]).toMatchObject({ runId: "run-a", toolCallId: "call-1", status: "blocked" });

    const limitedFixture = auditFixture();
    const limited = governTools(
      [{ ...tool, risk: ToolRisk.READ_ONLY }],
      context,
      { allowedRisks: new Set([ToolRisk.READ_ONLY]), maxCallsPerRun: 1, timeoutMs: 100, maxResultCharacters: 100 },
      limitedFixture.audit,
    );
    const limitedHooks = await loadHooks(limited.extensions[0] as InlineExtension);
    await expect(
      limitedHooks.toolCall({ type: "tool_call", toolCallId: "allowed", toolName: "send_external", input: {} }),
    ).resolves.toBeUndefined();
    await expect(
      limitedHooks.toolCall({ type: "tool_call", toolCallId: "limited", toolName: "send_external", input: {} }),
    ).resolves.toMatchObject({ block: true, reason: expect.stringContaining("TOOL_CALL_LIMIT") });
  });

  it("times out execution and replaces oversized results through the after hook", async () => {
    const fixture = auditFixture();
    const governed = governTools(
      [
        {
          risk: ToolRisk.READ_ONLY,
          definition: defineTool({
            name: "slow",
            label: "Slow",
            description: "Never finishes",
            parameters: Type.Object({}),
            execute: async () => new Promise(() => undefined),
          }),
        },
      ],
      context,
      { allowedRisks: new Set([ToolRisk.READ_ONLY]), maxCallsPerRun: 2, timeoutMs: 5, maxResultCharacters: 30 },
      fixture.audit,
    );
    await expect(governed.tools[0]?.execute("slow-call", {}, undefined, undefined, {} as never)).rejects.toThrow(
      "timed out",
    );
    const hooks = await loadHooks(governed.extensions[0] as InlineExtension);
    await hooks.toolCall({ type: "tool_call", toolCallId: "large-call", toolName: "slow", input: {} });
    const normalized = await hooks.toolResult({
      type: "tool_result",
      toolCallId: "large-call",
      toolName: "slow",
      input: {},
      content: [{ type: "text", text: "x".repeat(100) }],
      details: {},
      isError: false,
    });
    expect(normalized).toMatchObject({
      isError: true,
      content: [expect.objectContaining({ text: expect.stringContaining("TOOL_RESULT_TOO_LARGE") })],
    });
    expect(fixture.finishes.at(-1)).toMatchObject({ status: "failed", toolCallId: "large-call" });
  });
});
