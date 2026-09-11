import type { Logger } from "@kookbot/application";

export * from "./file-tools.js";
export * from "./governance.js";
export * from "./tool-registry.js";

export const TOOLS_PACKAGE = "@kookbot/tools" as const;

export interface ToolRuntimeDependencies {
  readonly logger: Logger;
}
