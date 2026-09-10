import type { DeliveryReceipt, OutgoingMessage } from "@kookbot/domain";

export interface MessagePublisher {
  publish(outgoing: OutgoingMessage): Promise<DeliveryReceipt>;
}
