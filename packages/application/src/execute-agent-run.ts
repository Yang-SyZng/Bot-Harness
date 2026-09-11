import { AgentRunStatus, SessionStatus, nowMs, type EntityId, type Message } from "@kookbot/domain";

import type { AgentRuntime, AgentRuntimeEvent, AgentRuntimeResult } from "./agent-runtime.js";
import { type UnitOfWork, type UnitOfWorkFactory, withUnitOfWork } from "./repositories.js";

export interface ExecuteAgentRunInput {
  readonly runId: EntityId;
  readonly history: readonly Message[];
  readonly current: Message;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: AgentRuntimeEvent) => void;
}

export interface ExecuteAgentRunResult extends AgentRuntimeResult {
  readonly runId: EntityId;
  readonly sessionId: EntityId;
}

function requireRunAndSession(uow: UnitOfWork, runId: EntityId) {
  return async () => {
    const run = await uow.agentRuns.get(runId);
    if (!run?.sessionId) throw new Error(`agent run ${runId} does not exist or has no session`);
    const session = await uow.sessions.get(run.sessionId);
    if (!session) throw new Error(`session ${run.sessionId} does not exist`);
    return { run, session, sessionId: run.sessionId };
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ExecuteAgentRun {
  readonly #makeUnitOfWork: UnitOfWorkFactory;
  readonly #runtime: AgentRuntime;

  constructor(makeUnitOfWork: UnitOfWorkFactory, runtime: AgentRuntime) {
    this.#makeUnitOfWork = makeUnitOfWork;
    this.#runtime = runtime;
  }

  async execute(input: ExecuteAgentRunInput): Promise<ExecuteAgentRunResult> {
    const sessionId = await withUnitOfWork(this.#makeUnitOfWork, async (uow) => {
      const { run, session, sessionId } = await requireRunAndSession(uow, input.runId)();
      if (run.status !== AgentRunStatus.QUEUED) {
        throw new Error(`agent run ${input.runId} is not queued (status: ${run.status})`);
      }
      run.status = AgentRunStatus.RUNNING;
      run.startedAt = nowMs();
      session.status = SessionStatus.RUNNING;
      session.updatedAt = nowMs();
      await uow.agentRuns.save(run);
      await uow.sessions.save(session);
      return sessionId;
    });

    let result: AgentRuntimeResult;
    try {
      result = await this.#runtime.run({
        runId: input.runId,
        sessionId,
        history: input.history,
        current: input.current,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(input.onEvent === undefined ? {} : { onEvent: input.onEvent }),
      });
    } catch (error) {
      const cancelled = input.signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
      result = {
        status: cancelled ? "cancelled" : "failed",
        text: "",
        errorMessage: errorMessage(error),
      };
      input.onEvent?.({ type: "error", message: result.errorMessage ?? "Agent runtime failed" });
    }

    await withUnitOfWork(this.#makeUnitOfWork, async (uow) => {
      const { run, session } = await requireRunAndSession(uow, input.runId)();
      run.status =
        result.status === "succeeded"
          ? AgentRunStatus.SUCCEEDED
          : result.status === "cancelled"
            ? AgentRunStatus.CANCELLED
            : AgentRunStatus.FAILED;
      run.completedAt = nowMs();
      session.status =
        result.status === "succeeded"
          ? SessionStatus.WAITING_USER
          : result.status === "cancelled"
            ? SessionStatus.CANCELLED
            : SessionStatus.FAILED;
      session.updatedAt = nowMs();
      await uow.agentRuns.save(run);
      await uow.sessions.save(session);
    });

    return { ...result, runId: input.runId, sessionId };
  }
}
