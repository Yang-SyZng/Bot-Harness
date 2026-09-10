import type { ConversationAddress } from "./transport.js";
import type { Message, MessageEnvelope } from "./entities.js";
import type { UnixMillis } from "./values.js";

export interface NormalizedIncoming {
  readonly envelope: MessageEnvelope;
  readonly address: ConversationAddress;
}

export interface OutgoingMessage {
  readonly deliveryId: string;
  readonly message: Message;
  readonly address: ConversationAddress;
  readonly externalReplyToMessageId?: string;
}

export interface DeliveryReceipt {
  readonly deliveryId: string;
  readonly externalMessageId: string;
  readonly externalMessageIds?: readonly string[];
  readonly sentAt?: UnixMillis;
}
