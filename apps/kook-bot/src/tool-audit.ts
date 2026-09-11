import { withUnitOfWork, type UnitOfWorkFactory } from "@kookbot/application";
import { AgentRunStep, AgentRunStepStatus, nowMs } from "@kookbot/domain";
import type { ToolAuditSink } from "@kookbot/tools";

export function createToolAuditSink(makeUnitOfWork: UnitOfWorkFactory): ToolAuditSink {
  return {
    started: (input) =>
      withUnitOfWork(makeUnitOfWork, (uow) =>
        uow.agentRunSteps.add(
          new AgentRunStep({
            ...input,
            status: AgentRunStepStatus.RUNNING,
            startedAt: nowMs(),
          }),
        ),
      ),
    finished: (input) =>
      withUnitOfWork(makeUnitOfWork, async (uow) => {
        const step = (await uow.agentRunSteps.listByRun(input.runId)).find(
          (candidate) => candidate.toolCallId === input.toolCallId,
        );
        if (!step) throw new Error(`tool audit step ${input.runId}/${input.toolCallId} is missing`);
        step.status =
          input.status === "succeeded"
            ? AgentRunStepStatus.SUCCEEDED
            : input.status === "blocked"
              ? AgentRunStepStatus.BLOCKED
              : AgentRunStepStatus.FAILED;
        step.resultText = input.resultText;
        step.errorMessage = input.errorMessage;
        step.completedAt = nowMs();
        await uow.agentRunSteps.save(step);
      }),
  };
}
