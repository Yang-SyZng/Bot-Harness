import type { Logger } from "@kookbot/application";

export const STORAGE_PACKAGE = "@kookbot/storage" as const;

export interface StorageDependencies {
  readonly logger: Logger;
}
