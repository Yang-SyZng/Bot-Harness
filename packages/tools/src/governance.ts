import type { InlineExtension, ToolDefinition, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import { ToolRisk, type EntityId } from "@kookbot/domain";

import type { ManagedTool, ToolContext } from "./tool-registry.js";

export interface ToolAuditStart {
  readonly runId: EntityId;
  readonly sessionId: EntityId;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly risk: ToolRisk;
  readonly argumentsJson: string;
}

export interface ToolAuditFinish {
  readonly runId: EntityId;
  readonly toolCallId: string;
  readonly status: "succeeded" | "failed" | "blocked";
  readonly resultText?: string;
  readonly errorMessage?: string;
}

export interface ToolAuditSink {
  started(input: ToolAuditStart): Promise<void>;
  finished(input: ToolAuditFinish): Promise<void>;
}

export interface ToolGovernancePolicy {
  readonly allowedRisks: ReadonlySet<ToolRisk>;
  readonly maxCallsPerRun: number;
  readonly timeoutMs: number;
  readonly maxResultCharacters: number;
}

export interface GovernedToolset {
  readonly tools: ToolDefinition[];
  readonly extensions: InlineExtension[];
  readonly progressByToolName: Readonly<Record<string, string>>;
}

const REDACTED_KEYS = /authorization|api[_-]?key|content|password|secret|token/i;

function safeJson(value: unknown, maxCharacters: number): string {
  let encoded: string;
  try {
    encoded = JSON.stringify(value, (key, item) => (key && REDACTED_KEYS.test(key) ? "[REDACTED]" : item));
  } catch {
    encoded = '"[UNSERIALIZABLE]"';
  }
  return encoded.length <= maxCharacters ? encoded : `${encoded.slice(0, maxCharacters)}…`;
}

function validatePositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
}

function withTimeout(tool: ToolDefinition, timeoutMs: number): ToolDefinition {
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate, context) => {
      signal?.throwIfAborted();
      const timeoutController = new AbortController();
      const abort = (): void => timeoutController.abort(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => timeoutController.abort(new Error(`tool ${tool.name} timed out`)), timeoutMs);
      try {
        const combinedSignal = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;
        return await Promise.race([
          tool.execute(toolCallId, params, combinedSignal, onUpdate, context),
          new Promise<never>((_resolve, reject) => {
            timeoutController.signal.addEventListener(
              "abort",
              () => reject(timeoutController.signal.reason ?? new Error(`tool ${tool.name} timed out`)),
              { once: true },
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    },
  };
}

function resultSummary(event: ToolResultEvent, maxCharacters: number): string {
  return safeJson(event.content, maxCharacters);
}

export function governTools(
  managedTools: readonly ManagedTool[],
  context: ToolContext,
  policy: ToolGovernancePolicy,
  audit: ToolAuditSink,
): GovernedToolset {
  validatePositiveInteger("maxCallsPerRun", policy.maxCallsPerRun);
  validatePositiveInteger("timeoutMs", policy.timeoutMs);
  validatePositiveInteger("maxResultCharacters", policy.maxResultCharacters);
  const byName = new Map(managedTools.map((tool) => [tool.definition.name, tool]));
  if (byName.size !== managedTools.length) throw new Error("governed tool names must be unique");
  const blocked = new Set<string>();
  let calls = 0;

  const extension: InlineExtension = {
    name: "kookbot-tool-governance",
    hidden: true,
    factory: (pi) => {
      pi.on("tool_call", async (event) => {
        const tool = byName.get(event.toolName);
        if (!tool) return { block: true, reason: "TOOL_NOT_REGISTERED: tool is not available" };
        calls += 1;
        const start: ToolAuditStart = {
          ...context,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          risk: tool.risk,
          argumentsJson: safeJson(event.input, 2_000),
        };
        await audit.started(start);
        const reason = !policy.allowedRisks.has(tool.risk)
          ? `TOOL_RISK_BLOCKED: ${tool.risk} tools are not allowed`
          : calls > policy.maxCallsPerRun
            ? `TOOL_CALL_LIMIT: maximum ${policy.maxCallsPerRun} calls per run`
            : undefined;
        if (reason) {
          blocked.add(event.toolCallId);
          await audit.finished({ ...context, toolCallId: event.toolCallId, status: "blocked", errorMessage: reason });
          return { block: true, reason };
        }
        return undefined;
      });
      pi.on("tool_result", async (event) => {
        if (blocked.has(event.toolCallId)) return undefined;
        const serialized = JSON.stringify(event.content);
        const oversized = serialized.length > policy.maxResultCharacters;
        const content = oversized
          ? [{ type: "text" as const, text: `TOOL_RESULT_TOO_LARGE: maximum ${policy.maxResultCharacters} characters` }]
          : event.content;
        const isError = event.isError || oversized;
        await audit.finished({
          ...context,
          toolCallId: event.toolCallId,
          status: isError ? "failed" : "succeeded",
          resultText: resultSummary({ ...event, content }, policy.maxResultCharacters),
          ...(isError
            ? {
                errorMessage: oversized
                  ? `TOOL_RESULT_TOO_LARGE: maximum ${policy.maxResultCharacters} characters`
                  : resultSummary(event, 500),
              }
            : {}),
        });
        return oversized ? { content, isError: true } : undefined;
      });
    },
  };

  return {
    tools: managedTools.map((tool) => withTimeout(tool.definition, policy.timeoutMs)),
    extensions: [extension],
    progressByToolName: Object.fromEntries(
      managedTools.flatMap((tool) => (tool.progressText ? [[tool.definition.name, tool.progressText]] : [])),
    ),
  };
}

export const DEFAULT_TOOL_GOVERNANCE_POLICY: ToolGovernancePolicy = Object.freeze({
  allowedRisks: new Set([ToolRisk.READ_ONLY, ToolRisk.WRITE]),
  maxCallsPerRun: 12,
  timeoutMs: 15_000,
  maxResultCharacters: 20_000,
});
