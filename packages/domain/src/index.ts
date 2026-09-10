export const DOMAIN_PACKAGE = "@kookbot/domain" as const;
export type DomainPackageName = typeof DOMAIN_PACKAGE;

export * from "./entities.js";
export * from "./messaging.js";
export * from "./transport.js";
export * from "./values.js";
