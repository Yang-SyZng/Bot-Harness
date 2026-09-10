export interface ContextMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface ContextPiece {
  readonly source: "goal" | "snapshot" | "message" | "current";
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface AgentContext {
  readonly goal?: string;
  readonly pieces: readonly ContextPiece[];
  readonly tokenEstimate: number;
  readonly truncated: boolean;
}

const CHARS_PER_TOKEN = 4;

function estimate(pieces: readonly ContextPiece[]): number {
  return pieces.reduce((total, piece) => total + Math.floor(piece.content.length / CHARS_PER_TOKEN), 0);
}

export class ContextBuilder {
  build(
    input: {
      readonly goal?: string;
      readonly snapshotSummary?: string;
      readonly messages?: readonly ContextMessage[];
      readonly current?: string;
      readonly tokenBudget?: number;
    } = {},
  ): AgentContext {
    const pieces: ContextPiece[] = [];
    if (input.goal) pieces.push({ source: "goal", role: "system", content: input.goal });
    if (input.snapshotSummary) pieces.push({ source: "snapshot", role: "system", content: input.snapshotSummary });
    for (const message of input.messages ?? []) {
      pieces.push({ source: "message", role: message.role, content: message.content });
    }
    if (input.current) pieces.push({ source: "current", role: "user", content: input.current });

    let tokenEstimate = estimate(pieces);
    const truncated = input.tokenBudget !== undefined && tokenEstimate > input.tokenBudget;
    if (truncated) {
      while (tokenEstimate > input.tokenBudget) {
        let removed = false;
        for (let index = pieces.length - 1; index > 0; index -= 1) {
          if (pieces[index]?.source === "message") {
            pieces.splice(index, 1);
            removed = true;
            break;
          }
        }
        if (!removed) break;
        tokenEstimate = estimate(pieces);
      }
    }

    return {
      ...(input.goal === undefined ? {} : { goal: input.goal }),
      pieces,
      tokenEstimate,
      truncated,
    };
  }
}
