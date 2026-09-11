import { randomUUID } from "node:crypto";

declare const entityIdBrand: unique symbol;
declare const unixMillisBrand: unique symbol;

export type EntityId = string & { readonly [entityIdBrand]: "EntityId" };
export type UnixMillis = number & { readonly [unixMillisBrand]: "UnixMillis" };

export function entityId(value: string): EntityId {
  if (!value.trim()) {
    throw new TypeError("entity id must not be empty");
  }
  return value as EntityId;
}

export function newId(): EntityId {
  return randomUUID().replaceAll("-", "") as EntityId;
}

export function unixMillis(value: number): UnixMillis {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Unix milliseconds must be a non-negative safe integer");
  }
  return value as UnixMillis;
}

export function nowMs(): UnixMillis {
  return unixMillis(Date.now());
}

export const BotPlatform = {
  UNKNOWN: "unknown",
  KOOK: "kook",
} as const;
export type BotPlatform = (typeof BotPlatform)[keyof typeof BotPlatform];

export const ConversationType = {
  DIRECT: "direct",
  GROUP: "group",
  TOPIC: "topic",
} as const;
export type ConversationType = (typeof ConversationType)[keyof typeof ConversationType];

export const AttachmentKind = {
  IMAGE: "image",
  FILE: "file",
  AUDIO: "audio",
  VIDEO: "video",
} as const;
export type AttachmentKind = (typeof AttachmentKind)[keyof typeof AttachmentKind];

export const ActorRefType = {
  BOT: "bot",
  PEOPLE: "people",
} as const;
export type ActorRefType = (typeof ActorRefType)[keyof typeof ActorRefType];

export const MessageEnvelopeDirection = {
  P2P: "p2p",
  P2B: "p2b",
  B2P: "b2p",
  B2B: "b2b",
  OTHER: "other",
} as const;
export type MessageEnvelopeDirection = (typeof MessageEnvelopeDirection)[keyof typeof MessageEnvelopeDirection];

export const TransportFlow = {
  INBOUND: "inbound",
  OUTBOUND: "outbound",
  INTERNAL: "internal",
} as const;
export type TransportFlow = (typeof TransportFlow)[keyof typeof TransportFlow];

export const MessageRole = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
} as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

export const AssetRole = {
  INPUT: "input",
  OUTPUT: "output",
} as const;
export type AssetRole = (typeof AssetRole)[keyof typeof AssetRole];

export const SessionStatus = {
  CREATED: "CREATED",
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  WAITING_USER: "WAITING_USER",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  TIMED_OUT: "TIMED_OUT",
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const AgentRunStatus = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  TIMED_OUT: "TIMED_OUT",
} as const;
export type AgentRunStatus = (typeof AgentRunStatus)[keyof typeof AgentRunStatus];

export const ToolRisk = {
  READ_ONLY: "read_only",
  WRITE: "write",
  EXTERNAL_SIDE_EFFECT: "external_side_effect",
} as const;
export type ToolRisk = (typeof ToolRisk)[keyof typeof ToolRisk];

export const AgentRunStepStatus = {
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
} as const;
export type AgentRunStepStatus = (typeof AgentRunStepStatus)[keyof typeof AgentRunStepStatus];

export const SessionEnvelopeRole = {
  INPUT: "input",
  CONTEXT: "context",
  OUTPUT: "output",
  REFERENCE: "reference",
} as const;
export type SessionEnvelopeRole = (typeof SessionEnvelopeRole)[keyof typeof SessionEnvelopeRole];
