import type { Message } from "@kookbot/domain";

export type AgentRuntimeEvent =
  | { readonly type: "start" }
  | { readonly type: "text_delta"; readonly delta: string }
  | { readonly type: "tool_start"; readonly callId: string; readonly name: string; readonly arguments: unknown }
  | { readonly type: "tool_update"; readonly callId: string; readonly name: string; readonly update: unknown }
  | {
      readonly type: "tool_end";
      readonly callId: string;
      readonly name: string;
      readonly result: unknown;
      readonly isError: boolean;
    }
  | { readonly type: "end"; readonly status: AgentRuntimeStatus }
  | { readonly type: "error"; readonly message: string };

export type AgentRuntimeStatus = "succeeded" | "cancelled" | "failed";

export interface AgentRuntimeInput {
  readonly history: readonly Message[];
  readonly current: Message;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: AgentRuntimeEvent) => void;
}

export interface AgentRuntimeResult {
  readonly status: AgentRuntimeStatus;
  readonly text: string;
  readonly errorMessage?: string;
}

export interface AgentRuntime {
  run(input: AgentRuntimeInput): Promise<AgentRuntimeResult>;
}
