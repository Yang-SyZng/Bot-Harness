import type { Logger } from "@kookbot/application";

export * from "./memory/repositories.js";
export * from "./memory/store.js";
export * from "./memory/unit-of-work.js";

export const PERSISTENCE_PACKAGE = "@kookbot/persistence" as const;

export interface PersistenceDependencies {
  readonly logger: Logger;
}
