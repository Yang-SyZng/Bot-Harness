import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentSessionEvent, InlineExtension, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AgentRuntime, AgentRuntimeEvent, AgentRuntimeInput, AgentRuntimeResult } from "@kookbot/application";
import { MessageRole } from "@kookbot/domain";

import type { PiSessionFactory } from "./headless-session.js";
import { domainMessageText, domainMessageToAgentMessage, transformContext } from "./messages.js";

function assistantText(message: AssistantMessage | undefined): string {
  return (
    message?.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("") ?? ""
  );
}

function lastAssistant(messages: readonly AgentMessage[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") return message;
  }
  return undefined;
}

function mapEvent(
  event: AgentSessionEvent,
  progressByToolName: Readonly<Record<string, string>>,
): AgentRuntimeEvent | undefined {
  switch (event.type) {
    case "agent_start":
      return { type: "start" };
    case "message_update":
      return event.assistantMessageEvent.type === "text_delta"
        ? { type: "text_delta", delta: event.assistantMessageEvent.delta }
        : undefined;
    case "tool_execution_start":
      return {
        type: "tool_start",
        callId: event.toolCallId,
        name: event.toolName,
        arguments: event.args,
        ...(progressByToolName[event.toolName] === undefined
          ? {}
          : { safeProgressText: progressByToolName[event.toolName] }),
      };
    case "tool_execution_update":
      return {
        type: "tool_update",
        callId: event.toolCallId,
        name: event.toolName,
        update: event.partialResult,
      };
    case "tool_execution_end":
      return {
        type: "tool_end",
        callId: event.toolCallId,
        name: event.toolName,
        result: event.result,
        isError: event.isError,
      };
    default:
      return undefined;
  }
}

export class PiAgentRuntimeAdapter implements AgentRuntime {
  constructor(
    private readonly createSession: PiSessionFactory,
    private readonly createTools?: (context: {
      readonly runId: NonNullable<AgentRuntimeInput["runId"]>;
      readonly sessionId: NonNullable<AgentRuntimeInput["sessionId"]>;
    }) =>
      | ToolDefinition[]
      | {
          readonly tools: ToolDefinition[];
          readonly extensions?: InlineExtension[];
          readonly progressByToolName?: Readonly<Record<string, string>>;
        }
      | Promise<
          | ToolDefinition[]
          | {
              readonly tools: ToolDefinition[];
              readonly extensions?: InlineExtension[];
              readonly progressByToolName?: Readonly<Record<string, string>>;
            }
        >,
  ) {}

  async run(input: AgentRuntimeInput): Promise<AgentRuntimeResult> {
    if (input.signal?.aborted) {
      input.onEvent?.({ type: "end", status: "cancelled" });
      return { status: "cancelled", text: "", errorMessage: "Agent run was cancelled" };
    }

    const systemContext = input.history
      .filter((message) => message.role === MessageRole.SYSTEM && message.content)
      .map((message) => message.content)
      .join("\n\n");
    let customTools: ToolDefinition[] | undefined;
    let extensions: InlineExtension[] | undefined;
    let progressByToolName: Readonly<Record<string, string>> = {};
    if (this.createTools) {
      if (!input.runId || !input.sessionId) throw new Error("runId and sessionId are required for scoped tools");
      const toolset = await this.createTools({ runId: input.runId, sessionId: input.sessionId });
      if (Array.isArray(toolset)) {
        customTools = toolset;
      } else {
        customTools = toolset.tools;
        extensions = toolset.extensions;
        progressByToolName = toolset.progressByToolName ?? {};
      }
    }
    const session = await this.createSession(systemContext || undefined, customTools, extensions);
    const model = session.model;
    if (!model) {
      session.dispose();
      throw new Error("Pi session has no model");
    }

    const history = input.history
      .map((message) => domainMessageToAgentMessage(message, model))
      .filter((message): message is AgentMessage => message !== undefined);
    session.state.messages = await transformContext(history, input.signal);

    let eventDelivery = Promise.resolve();
    const unsubscribe = session.subscribe((event) => {
      const mapped = mapEvent(event, progressByToolName);
      if (mapped && input.onEvent) {
        eventDelivery = eventDelivery.then(() => input.onEvent?.(mapped)).then(() => undefined);
      }
    });
    const abort = (): void => {
      void session.abort();
    };
    input.signal?.addEventListener("abort", abort, { once: true });

    try {
      await session.prompt(domainMessageText(input.current), { expandPromptTemplates: false });
      await eventDelivery;
      const final = lastAssistant(session.state.messages);
      const text = assistantText(final);
      const status =
        input.signal?.aborted === true || final?.stopReason === "aborted"
          ? "cancelled"
          : final?.stopReason === "error"
            ? "failed"
            : "succeeded";
      const result: AgentRuntimeResult = {
        status,
        text,
        ...(final?.errorMessage === undefined ? {} : { errorMessage: final.errorMessage }),
      };
      if (status === "failed") input.onEvent?.({ type: "error", message: result.errorMessage ?? "Pi model failed" });
      input.onEvent?.({ type: "end", status });
      return result;
    } finally {
      input.signal?.removeEventListener("abort", abort);
      unsubscribe();
      session.dispose();
    }
  }
}
