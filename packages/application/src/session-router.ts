import { type EntityId, Session, SessionStatus, nowMs } from "@kookbot/domain";

export type SessionRoute = { readonly action: "append"; readonly sessionId: EntityId } | { readonly action: "create" };

export class SessionRouter {
  route(input: {
    readonly conversationId: EntityId;
    readonly ownerUserId: string;
    readonly activeSession?: Session;
  }): SessionRoute {
    const { conversationId, ownerUserId, activeSession } = input;
    if (
      activeSession?.conversationId === conversationId &&
      activeSession.ownerUserId === ownerUserId &&
      activeSession.isActive()
    ) {
      return { action: "append", sessionId: activeSession.id };
    }
    return { action: "create" };
  }

  newSession(input: {
    readonly conversationId: EntityId;
    readonly ownerUserId: string;
    readonly goal?: string;
  }): Session {
    const timestamp = nowMs();
    return new Session({
      conversationId: input.conversationId,
      ownerUserId: input.ownerUserId,
      ...(input.goal === undefined ? {} : { goal: input.goal }),
      status: SessionStatus.QUEUED,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}
