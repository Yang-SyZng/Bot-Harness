import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { digestFile } from "./file-digest.js";
import {
  type ActorRefType,
  type AttachmentKind,
  type BotPlatform,
  type EntityId,
  type MessageEnvelopeDirection,
  type TransportFlow,
  type UnixMillis,
  newId,
  nowMs,
} from "./values.js";

export interface ActorRefInit {
  readonly id?: EntityId;
  readonly actorType?: ActorRefType | undefined;
  readonly externalId?: string | undefined;
  readonly displayName?: string | undefined;
  readonly avatar?: string | undefined;
}

export class ActorRef {
  readonly id: EntityId;
  actorType: ActorRefType | undefined;
  externalId: string | undefined;
  displayName: string | undefined;
  avatar: string | undefined;

  constructor(init: ActorRefInit = {}) {
    this.id = init.id ?? newId();
    this.actorType = init.actorType;
    this.externalId = init.externalId;
    this.displayName = init.displayName;
    this.avatar = init.avatar;
  }

  clone(): ActorRef {
    return new ActorRef(this);
  }
}

export interface ConnectorInit {
  readonly id?: EntityId;
  readonly platform?: BotPlatform | undefined;
  readonly botActorId?: EntityId | undefined;
  readonly configRef?: string | undefined;
}

export class Connector {
  readonly id: EntityId;
  platform: BotPlatform | undefined;
  botActorId: EntityId | undefined;
  configRef: string | undefined;

  constructor(init: ConnectorInit = {}) {
    this.id = init.id ?? newId();
    this.platform = init.platform;
    this.botActorId = init.botActorId;
    this.configRef = init.configRef;
  }

  clone(): Connector {
    return new Connector(this);
  }
}

export interface TransportRefInit {
  readonly connector?: Connector | undefined;
  readonly externalEventId?: string | undefined;
  readonly externalMessageId?: string | undefined;
  readonly externalReplyToMessageId?: string | undefined;
}

export class TransportRef {
  connector: Connector | undefined;
  externalEventId: string | undefined;
  externalMessageId: string | undefined;
  externalReplyToMessageId: string | undefined;

  constructor(init: TransportRefInit = {}) {
    this.connector = init.connector?.clone();
    this.externalEventId = init.externalEventId;
    this.externalMessageId = init.externalMessageId;
    this.externalReplyToMessageId = init.externalReplyToMessageId;
  }

  clone(): TransportRef {
    return new TransportRef(this);
  }
}

export interface ConversationAddressInit {
  readonly platform?: BotPlatform | undefined;
  readonly spaceId?: string | undefined;
  readonly roomId?: string | undefined;
  readonly topicId?: string | undefined;
  readonly externalId?: string | undefined;
}

export interface ConversationAddressMapping {
  readonly external_id: string | null;
  readonly platform: BotPlatform | null;
  readonly room_id: string | null;
  readonly space_id: string | null;
  readonly topic_id: string | null;
}

export class ConversationAddress {
  readonly platform: BotPlatform | undefined;
  readonly spaceId: string | undefined;
  readonly roomId: string | undefined;
  readonly topicId: string | undefined;
  readonly externalId: string | undefined;

  constructor(init: ConversationAddressInit = {}) {
    this.platform = init.platform;
    this.spaceId = init.spaceId;
    this.roomId = init.roomId;
    this.topicId = init.topicId;
    this.externalId = init.externalId;
  }

  asMapping(): ConversationAddressMapping {
    return {
      external_id: this.externalId ?? null,
      platform: this.platform ?? null,
      room_id: this.roomId ?? null,
      space_id: this.spaceId ?? null,
      topic_id: this.topicId ?? null,
    };
  }

  identityKey(): string {
    return createHash("sha256").update(JSON.stringify(this.asMapping())).digest("hex");
  }

  clone(): ConversationAddress {
    return new ConversationAddress(this);
  }
}

export interface AttachmentInit {
  readonly id?: EntityId;
  readonly kind?: AttachmentKind | undefined;
  readonly name?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly sourceUrl?: string | undefined;
  readonly localPath?: string | undefined;
  readonly size?: number | undefined;
  readonly sha256?: string | undefined;
}

export class Attachment {
  readonly id: EntityId;
  kind: AttachmentKind | undefined;
  name: string | undefined;
  mimeType: string | undefined;
  sourceUrl: string | undefined;
  localPath: string | undefined;
  size: number | undefined;
  sha256: string | undefined;

  constructor(init: AttachmentInit = {}) {
    this.id = init.id ?? newId();
    this.kind = init.kind;
    this.name = init.name;
    this.mimeType = init.mimeType;
    this.sourceUrl = init.sourceUrl;
    this.localPath = init.localPath;
    this.size = init.size;
    this.sha256 = init.sha256;
  }

  get isDownloaded(): boolean {
    return this.localPath !== undefined && this.sha256 !== undefined;
  }

  async fillFromLocal(path: string): Promise<void> {
    const digest = await digestFile(path);
    this.localPath = resolve(path);
    this.size = digest.size;
    this.sha256 = digest.sha256;
  }

  clone(): Attachment {
    return new Attachment(this);
  }
}

export interface EnvelopeTransportFields {
  readonly sender?: ActorRef | undefined;
  readonly recipient?: ActorRef | undefined;
  readonly transport?: TransportRef | undefined;
  readonly direction?: MessageEnvelopeDirection | undefined;
  readonly transportFlow?: TransportFlow | undefined;
  readonly occurredAt?: UnixMillis | undefined;
  readonly receivedAt?: UnixMillis | undefined;
}

export { nowMs };
