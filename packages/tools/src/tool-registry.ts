import { type ToolDefinition, defineTool } from "@earendil-works/pi-coding-agent";
import type { EntityId, ToolRisk } from "@kookbot/domain";
import { ToolRisk as Risk } from "@kookbot/domain";
import { Type } from "typebox";

export interface ToolContext {
  readonly runId: EntityId;
  readonly sessionId: EntityId;
}

export interface ManagedTool {
  readonly definition: ToolDefinition;
  readonly risk: ToolRisk;
  readonly progressText?: string;
}

export type SessionToolFactory = (context: ToolContext) => readonly ManagedTool[] | Promise<readonly ManagedTool[]>;

export class ToolRegistry {
  readonly #staticTools = new Map<string, ManagedTool>();
  readonly #sessionFactories: SessionToolFactory[] = [];

  registerStatic(tool: ManagedTool): this {
    if (this.#staticTools.has(tool.definition.name))
      throw new Error(`tool ${tool.definition.name} is already registered`);
    this.#staticTools.set(tool.definition.name, tool);
    return this;
  }

  registerSession(factory: SessionToolFactory): this {
    this.#sessionFactories.push(factory);
    return this;
  }

  async resolve(context: ToolContext): Promise<ManagedTool[]> {
    const resolved = [...this.#staticTools.values()];
    for (const factory of this.#sessionFactories) resolved.push(...(await factory(context)));
    const names = new Set<string>();
    for (const tool of resolved) {
      if (names.has(tool.definition.name)) throw new Error(`tool ${tool.definition.name} is registered more than once`);
      names.add(tool.definition.name);
    }
    return resolved;
  }
}

export function createCurrentTimeTool(now: () => Date = () => new Date()): ManagedTool {
  return {
    risk: Risk.READ_ONLY,
    progressText: "Checking the current time...",
    definition: defineTool({
      name: "get_current_time",
      label: "Get current time",
      description: "Get the bot host's current time as an ISO-8601 timestamp.",
      parameters: Type.Object({}),
      executionMode: "parallel",
      execute: async () => ({
        content: [{ type: "text", text: JSON.stringify({ iso: now().toISOString() }) }],
        details: {},
      }),
    }),
  };
}
