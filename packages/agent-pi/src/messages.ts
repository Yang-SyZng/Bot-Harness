import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Message as LlmMessage, Model, Usage } from "@earendil-works/pi-ai";
import { convertToLlm as piConvertToLlm } from "@earendil-works/pi-coding-agent";
import { MessageRole, type Message } from "@kookbot/domain";

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export function domainMessageText(message: Message): string {
  const content = message.content ?? "";
  if (message.attachments.length === 0) return content;
  const hints = message.attachments
    .map((attachment) => `[Attachment: ${attachment.name ?? "unnamed"}; assetId: ${attachment.id}]`)
    .join("\n");
  return content ? `${content}\n\n${hints}` : hints;
}

export function domainMessageToAgentMessage(message: Message, model: Model<Api>): AgentMessage | undefined {
  const content = domainMessageText(message);
  const timestamp = Date.now();
  if (message.role === MessageRole.SYSTEM) return undefined;
  if (message.role !== MessageRole.ASSISTANT) {
    return { role: "user", content: [{ type: "text", text: content }], timestamp };
  }
  const assistant: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: content }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: structuredClone(EMPTY_USAGE),
    stopReason: "stop",
    timestamp,
  };
  return assistant;
}

export function convertToLlm(messages: AgentMessage[]): LlmMessage[] {
  return piConvertToLlm(messages);
}

export async function transformContext(messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> {
  signal?.throwIfAborted();
  return messages.filter((message) => {
    if (message.role !== "assistant") return true;
    return message.stopReason !== "error" && message.stopReason !== "aborted";
  });
}
