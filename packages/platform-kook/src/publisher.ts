import type { MessagePublisher } from "@kookbot/application";
import { nowMs, type DeliveryReceipt, type OutgoingMessage } from "@kookbot/domain";

export interface KookSentMessage {
  readonly id: string;
}

export interface KookPublishingClient {
  sendTextMessage(targetId: string, content: string, options?: { quote?: string }): Promise<KookSentMessage>;
  sendDirectTextMessage(targetId: string, content: string, options?: { quote?: string }): Promise<KookSentMessage>;
  uploadAsset?(filePath: string): Promise<{ readonly url: string }>;
  sendFileMessage?(targetId: string, assetUrl: string, options?: { quote?: string }): Promise<KookSentMessage>;
  sendDirectFileMessage?(targetId: string, assetUrl: string, options?: { quote?: string }): Promise<KookSentMessage>;
}

export function splitKookText(text: string, maxLength = 1800): string[] {
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) throw new TypeError("maxLength must be positive");
  if (text.length === 0) return [""];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let boundary = remaining.lastIndexOf("\n", maxLength);
    if (boundary < Math.floor(maxLength / 2)) boundary = remaining.lastIndexOf(" ", maxLength);
    if (boundary < Math.floor(maxLength / 2)) boundary = maxLength;
    chunks.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary).replace(/^\s+/u, "");
  }
  chunks.push(remaining);
  return chunks;
}

export class KookPublisher implements MessagePublisher {
  constructor(
    private readonly client: KookPublishingClient,
    private readonly maxTextLength = 1800,
  ) {}

  async publish(outgoing: OutgoingMessage): Promise<DeliveryReceipt> {
    const target = outgoing.address.roomId ?? outgoing.address.externalId;
    if (!target) throw new TypeError("KOOK outgoing address requires roomId or externalId");
    const content = outgoing.message.content ?? "";
    const chunks =
      content || outgoing.message.attachments.length === 0 ? splitKookText(content, this.maxTextLength) : [];
    const sent: KookSentMessage[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const quote = index === 0 ? outgoing.externalReplyToMessageId : undefined;
      sent.push(
        outgoing.address.roomId
          ? await this.client.sendTextMessage(target, chunk, quote ? { quote } : undefined)
          : await this.client.sendDirectTextMessage(target, chunk, quote ? { quote } : undefined),
      );
    }
    for (const attachment of outgoing.message.attachments) {
      if (!attachment.localPath) throw new TypeError(`outgoing attachment ${attachment.id} has no local path`);
      if (!this.client.uploadAsset || !this.client.sendFileMessage || !this.client.sendDirectFileMessage) {
        throw new TypeError("KOOK publishing client does not support file uploads");
      }
      const uploaded = await this.client.uploadAsset(attachment.localPath);
      const quote = sent.length === 0 ? outgoing.externalReplyToMessageId : undefined;
      sent.push(
        outgoing.address.roomId
          ? await this.client.sendFileMessage(target, uploaded.url, quote ? { quote } : undefined)
          : await this.client.sendDirectFileMessage(target, uploaded.url, quote ? { quote } : undefined),
      );
    }
    const ids = sent.map((message) => message.id);
    const externalMessageId = ids[0];
    if (!externalMessageId) throw new Error("KOOK publisher returned no message id");
    return {
      deliveryId: outgoing.deliveryId,
      externalMessageId,
      externalMessageIds: ids,
      sentAt: nowMs(),
    };
  }
}
