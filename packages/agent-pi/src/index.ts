import type { Logger } from "@kookbot/application";

export * from "./headless-session.js";
export * from "./messages.js";
export * from "./prompts/base-system-prompt.js";
export * from "./runtime-adapter.js";

export const AGENT_PI_PACKAGE = "@kookbot/agent-pi" as const;

export interface PiRuntimeDependencies {
  readonly logger: Logger;
}

export interface McpAdapterModule {
  readonly createMcpAdapter: (options?: {
    readonly config?: { readonly mcpServers: Readonly<Record<string, unknown>> };
  }) => (pi: unknown) => void;
}

export async function loadMcpAdapter(): Promise<McpAdapterModule> {
  const moduleName: string = "pi-mcp-adapter";
  const loaded: unknown = await import(moduleName);
  if (
    typeof loaded !== "object" ||
    loaded === null ||
    !("createMcpAdapter" in loaded) ||
    typeof loaded.createMcpAdapter !== "function"
  ) {
    throw new TypeError("pi-mcp-adapter does not export createMcpAdapter");
  }
  return loaded as McpAdapterModule;
}
