import { ContextBuilder, SessionRouter } from "@kookbot/application";
import { Session, SessionStatus, entityId } from "@kookbot/domain";
import { describe, expect, it } from "vitest";

describe("SessionRouter", () => {
  const conversationId = entityId("c1");
  const router = new SessionRouter();

  it("appends only to an active session in the same owner scope", () => {
    const active = new Session({
      id: entityId("s1"),
      conversationId,
      ownerUserId: "u1",
      status: SessionStatus.RUNNING,
    });
    expect(router.route({ conversationId, ownerUserId: "u1", activeSession: active })).toEqual({
      action: "append",
      sessionId: active.id,
    });
    expect(router.route({ conversationId, ownerUserId: "u2", activeSession: active })).toEqual({ action: "create" });
  });

  it.each([SessionStatus.PAUSED, SessionStatus.COMPLETED, SessionStatus.FAILED])(
    "creates a session when the prior state is %s",
    (status) => {
      expect(
        router.route({
          conversationId,
          ownerUserId: "u1",
          activeSession: new Session({ conversationId, ownerUserId: "u1", status }),
        }),
      ).toEqual({ action: "create" });
    },
  );

  it("initializes a queued session", () => {
    const session = router.newSession({ conversationId, ownerUserId: "u1", goal: "summarize" });
    expect(session).toMatchObject({
      conversationId,
      ownerUserId: "u1",
      goal: "summarize",
      status: SessionStatus.QUEUED,
    });
    expect(session.createdAt).toEqual(expect.any(Number));
  });
});

describe("ContextBuilder", () => {
  it("orders goal, snapshot, history, and current input", () => {
    const context = new ContextBuilder().build({
      goal: "goal",
      snapshotSummary: "summary",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
      current: "now",
    });
    expect(context.pieces.map((piece) => piece.source)).toEqual(["goal", "snapshot", "message", "message", "current"]);
  });

  it("drops history first when over budget", () => {
    const context = new ContextBuilder().build({
      goal: "g",
      messages: Array.from({ length: 10 }, () => ({ role: "user" as const, content: "x".repeat(40) })),
      current: "keep",
      tokenBudget: 8,
    });
    expect(context.truncated).toBe(true);
    expect(context.pieces.map((piece) => piece.source)).toEqual(["goal", "current"]);
  });
});
