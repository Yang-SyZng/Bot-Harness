import {
  ActorRef,
  ActorRefType,
  Attachment,
  AttachmentKind,
  BotPlatform,
  ConversationAddress,
  Message,
  MessageEnvelope,
  MessageEnvelopeDirection,
  MessageRole,
  TransportFlow,
  TransportRef,
  nowMs,
  unixMillis,
  type NormalizedIncoming,
} from "@kookbot/domain";

export enum KookMessageType {
  TEXT = 1,
  IMAGE = 2,
  VIDEO = 3,
  FILE = 4,
  AUDIO = 8,
  KMARKDOWN = 9,
  CARD = 10,
}

export interface KookUser {
  readonly id: string;
  readonly username?: string;
  readonly nickname?: string;
  readonly avatar?: string;
  readonly vip_avatar?: string;
  readonly bot?: boolean;
}

export interface KookMessageEvent {
  readonly channel_type: "GROUP" | "PERSON" | "BROADCAST";
  readonly type: number;
  readonly target_id: string;
  readonly author_id: string;
  readonly content: string;
  readonly msg_id: string;
  readonly msg_timestamp: number;
  readonly nonce?: string;
  readonly extra: {
    readonly [key: string]: unknown;
    readonly type: number;
    readonly guild_id?: string;
    readonly mention?: readonly string[];
    readonly author?: KookUser;
    readonly attachments?:
      | { readonly type: string; readonly url: string; readonly name?: string; readonly size?: number }
      | readonly { readonly type: string; readonly url: string; readonly name?: string; readonly size?: number }[];
    readonly quote?: { id: string };
    readonly kmarkdown?: { raw_content?: string };
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function attachmentKind(type: string): AttachmentKind {
  if (type === "image") return AttachmentKind.IMAGE;
  if (type === "audio") return AttachmentKind.AUDIO;
  if (type === "video") return AttachmentKind.VIDEO;
  return AttachmentKind.FILE;
}

function messageAttachmentKind(type: number): AttachmentKind {
  if (type === KookMessageType.IMAGE) return AttachmentKind.IMAGE;
  if (type === KookMessageType.AUDIO) return AttachmentKind.AUDIO;
  if (type === KookMessageType.VIDEO) return AttachmentKind.VIDEO;
  return AttachmentKind.FILE;
}

function eventAttachments(value: KookMessageEvent["extra"]["attachments"]): Attachment[] {
  const items = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return items.map(
    (item) =>
      new Attachment({
        kind: attachmentKind(item.type),
        sourceUrl: item.url,
        name: item.name,
        ...(item.size === undefined ? {} : { size: item.size }),
      }),
  );
}

function extractCard(content: string): { text: string; attachments: Attachment[] } | undefined {
  let cards: unknown;
  try {
    cards = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!Array.isArray(cards)) return undefined;
  const texts: string[] = [];
  const attachments: Attachment[] = [];
  for (const card of cards) {
    if (!card || typeof card !== "object" || !("modules" in card) || !Array.isArray(card.modules)) continue;
    for (const rawModule of card.modules) {
      if (!rawModule || typeof rawModule !== "object") continue;
      const module = rawModule as Record<string, unknown>;
      if (module.type === "section") {
        const text = module.text as { content?: unknown } | undefined;
        if (typeof text?.content === "string") texts.push(text.content);
        const accessory = module.accessory as Record<string, unknown> | undefined;
        if (accessory?.type === "image" && typeof accessory.src === "string") {
          attachments.push(
            new Attachment({
              kind: AttachmentKind.IMAGE,
              sourceUrl: accessory.src,
              ...(typeof accessory.alt === "string" ? { name: accessory.alt } : {}),
            }),
          );
        }
      }
      const elements = Array.isArray(module.elements) ? module.elements : [];
      for (const rawElement of elements) {
        if (!rawElement || typeof rawElement !== "object") continue;
        const element = rawElement as Record<string, unknown>;
        if (typeof element.src !== "string") continue;
        attachments.push(
          new Attachment({
            kind: attachmentKind(typeof element.type === "string" ? element.type : "file"),
            sourceUrl: element.src,
            ...(typeof element.title === "string" ? { name: element.title } : {}),
          }),
        );
      }
      if (["file", "audio", "video"].includes(String(module.type)) && typeof module.src === "string") {
        attachments.push(
          new Attachment({
            kind: attachmentKind(String(module.type)),
            sourceUrl: module.src,
            ...(typeof module.title === "string" ? { name: module.title } : {}),
          }),
        );
      }
    }
  }
  return { text: texts.join("\n"), attachments };
}

function occurredAt(timestamp: number): ReturnType<typeof unixMillis> {
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  return unixMillis(Math.max(0, Math.trunc(milliseconds)));
}

export class KookMessageNormalizer {
  normalize(event: KookMessageEvent, botUserId: string): NormalizedIncoming | undefined {
    const author = event.extra.author;
    if (!author?.id || author.bot === true || author.id === botUserId) return undefined;
    const direct = event.channel_type === "PERSON";
    if (!direct && !event.extra.mention?.includes(botUserId)) return undefined;

    let text = event.content ?? "";
    let attachments = eventAttachments(event.extra.attachments);
    if (
      [KookMessageType.IMAGE, KookMessageType.VIDEO, KookMessageType.FILE, KookMessageType.AUDIO].includes(
        event.type,
      ) &&
      /^https?:\/\//u.test(text)
    ) {
      if (!attachments.some((attachment) => attachment.sourceUrl === text)) {
        attachments.push(new Attachment({ kind: messageAttachmentKind(event.type), sourceUrl: text }));
      }
      text = "";
    }
    if (event.type === KookMessageType.KMARKDOWN) text = event.extra.kmarkdown?.raw_content ?? text;
    if (event.type === KookMessageType.CARD) {
      const card = extractCard(text);
      if (!card) return undefined;
      text = card.text;
      attachments = [...attachments, ...card.attachments];
    }
    const escapedBotId = escapeRegExp(botUserId);
    text = text
      .replace(new RegExp(`\\(met\\)${escapedBotId}\\(met\\)`, "gu"), "")
      .replace(new RegExp(`<@!?${escapedBotId}>`, "gu"), "")
      .trim();

    const address = direct
      ? new ConversationAddress({ platform: BotPlatform.KOOK, externalId: author.id })
      : new ConversationAddress({
          platform: BotPlatform.KOOK,
          roomId: event.target_id,
          ...(event.extra.guild_id === undefined ? {} : { spaceId: event.extra.guild_id }),
        });
    return {
      address,
      envelope: new MessageEnvelope({
        message: new Message({ role: MessageRole.USER, ...(text ? { content: text } : {}), attachments }),
        sender: new ActorRef({
          actorType: ActorRefType.PEOPLE,
          externalId: author.id,
          displayName: author.nickname || author.username,
          avatar: author.vip_avatar || author.avatar,
        }),
        transport: new TransportRef({
          externalEventId: event.nonce || event.msg_id,
          externalMessageId: event.msg_id,
          ...(event.extra.quote?.id === undefined ? {} : { externalReplyToMessageId: event.extra.quote.id }),
        }),
        direction: MessageEnvelopeDirection.P2B,
        transportFlow: TransportFlow.INBOUND,
        occurredAt: occurredAt(event.msg_timestamp),
        receivedAt: nowMs(),
        idempotencyKey: `kook:${event.msg_id}`,
      }),
    };
  }
}
