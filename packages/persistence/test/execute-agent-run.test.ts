import { ExecuteAgentRun, type AgentRuntime, withUnitOfWork } from "@kookbot/application";
import { AgentRun, AgentRunStatus, Message, MessageRole, Session, SessionStatus, entityId } from "@kookbot/domain";
import { MemoryStore, fakeUnitOfWorkFactory } from "@kookbot/persistence";
import { describe, expect, it } from "vitest";

async function seededStore(): Promise<{ store: MemoryStore; run: AgentRun; session: Session }> {
  const store = new MemoryStore();
  const session = new Session({
    id: entityId("session-1"),
    conversationId: entityId("conversation-1"),
    ownerUserId: "user-1",
    status: SessionStatus.QUEUED,
  });
  const run = new AgentRun({ id: entityId("run-1"), sessionId: session.id });
  await withUnitOfWork(fakeUnitOfWorkFactory(store), async (uow) => {
    await uow.sessions.add(session);
    await uow.agentRuns.add(run);
  });
  return { store, run, session };
}

function current(): Message {
  return new Message({ role: MessageRole.USER, content: "hello" });
}

describe("ExecuteAgentRun", () => {
  it("moves a successful run through RUNNING to SUCCEEDED", async () => {
    const { store, run } = await seededStore();
    let observedRunning = false;
    const runtime: AgentRuntime = {
      run: async () => {
        const running = store.snapshot();
        observedRunning =
          running.agentRuns.get(run.id)?.status === AgentRunStatus.RUNNING &&
          running.sessions.get(entityId("session-1"))?.status === SessionStatus.RUNNING;
        return { status: "succeeded", text: "answer" };
      },
    };

    const result = await new ExecuteAgentRun(fakeUnitOfWorkFactory(store), runtime).execute({
      runId: run.id,
      history: [],
      current: current(),
    });
    const state = store.snapshot();
    expect(observedRunning).toBe(true);
    expect(result).toMatchObject({ status: "succeeded", text: "answer", sessionId: "session-1" });
    expect(state.agentRuns.get(run.id)).toMatchObject({ status: AgentRunStatus.SUCCEEDED });
    expect(state.agentRuns.get(run.id)?.startedAt).toEqual(expect.any(Number));
    expect(state.agentRuns.get(run.id)?.completedAt).toEqual(expect.any(Number));
    expect(state.sessions.get(entityId("session-1"))?.status).toBe(SessionStatus.WAITING_USER);
  });

  it.each([
    ["cancelled", AgentRunStatus.CANCELLED, SessionStatus.CANCELLED],
    ["failed", AgentRunStatus.FAILED, SessionStatus.FAILED],
  ] as const)("settles a %s runtime result without leaving RUNNING state", async (status, runStatus, sessionStatus) => {
    const { store, run } = await seededStore();
    const runtime: AgentRuntime = { run: async () => ({ status, text: "", errorMessage: status }) };
    await new ExecuteAgentRun(fakeUnitOfWorkFactory(store), runtime).execute({
      runId: run.id,
      history: [],
      current: current(),
    });
    expect(store.snapshot().agentRuns.get(run.id)?.status).toBe(runStatus);
    expect(store.snapshot().sessions.get(entityId("session-1"))?.status).toBe(sessionStatus);
  });

  it("maps an unexpected runtime exception to FAILED", async () => {
    const { store, run } = await seededStore();
    const runtime: AgentRuntime = {
      run: async () => {
        throw new Error("provider exploded");
      },
    };
    const result = await new ExecuteAgentRun(fakeUnitOfWorkFactory(store), runtime).execute({
      runId: run.id,
      history: [],
      current: current(),
    });
    expect(result).toMatchObject({ status: "failed", errorMessage: "provider exploded" });
    expect(store.snapshot().agentRuns.get(run.id)?.status).toBe(AgentRunStatus.FAILED);
    expect(store.snapshot().sessions.get(entityId("session-1"))?.status).toBe(SessionStatus.FAILED);
  });
});
