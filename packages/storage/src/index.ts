import type { Logger } from "@kookbot/application";

export * from "./asset-store.js";
export * from "./errors.js";
export * from "./local-asset-store.js";
export * from "./session-workspace.js";

export const STORAGE_PACKAGE = "@kookbot/storage" as const;

export interface StorageDependencies {
  readonly logger: Logger;
}
