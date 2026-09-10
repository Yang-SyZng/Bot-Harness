import type { Logger } from "@kookbot/application";
import { KookClientAdapter } from "./client.js";
import type { KookGatewayClient } from "./gateway.js";
import type { KookPublishingClient } from "./publisher.js";

export * from "./client.js";
export * from "./gateway.js";
export * from "./normalizer.js";
export * from "./publisher.js";

export const PLATFORM_KOOK_PACKAGE = "@kookbot/platform-kook" as const;
export const KOOK_SDK_VERSION = "@gedaxin/kook@2.0.17" as const;

export interface KookAdapterDependencies {
  readonly logger: Logger;
}

export type KookClient = KookGatewayClient & KookPublishingClient;

export function createKookClient(token: string): KookClient {
  return new KookClientAdapter(token);
}
