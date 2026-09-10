import type { DomainPackageName } from "@kookbot/domain";

export type { LogFields, Logger, LogLevel } from "./logger.js";
export * from "./message-publisher.js";
export * from "./agent-runtime.js";
export * from "./accept-incoming-envelope.js";
export * from "./context-builder.js";
export * from "./execute-agent-run.js";
export * from "./repositories.js";
export * from "./session-router.js";

export interface ApplicationBoundary {
  readonly domain: DomainPackageName;
}

export const APPLICATION_PACKAGE = "@kookbot/application" as const;
