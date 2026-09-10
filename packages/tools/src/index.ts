import type { Logger } from "@kookbot/application";

export const TOOLS_PACKAGE = "@kookbot/tools" as const;

export interface ToolRuntimeDependencies {
  readonly logger: Logger;
}
