import {
  type Context,
  InMemoryCredentialStore,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { ModelRuntime, defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DISABLED_CODING_TOOLS,
  BASE_SYSTEM_PROMPT,
  PiAgentRuntimeAdapter,
  convertToLlm,
  createConfiguredPiSessionFactory,
  createHeadlessPiSession,
  domainMessageToAgentMessage,
  resolvePiModelConfig,
  transformContext,
} from "../src/index.js";
import { Message, MessageRole, entityId } from "@kookbot/domain";

const sessions: Array<{ dispose(): void }> = [];

function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected value to be defined");
  return value;
}

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
});

async function fauxRuntime(responses: Parameters<ReturnType<typeof fauxProvider>["setResponses"]>[0]) {
  const faux = fauxProvider({ tokenSize: { min: 1, max: 2 } });
  faux.setResponses(responses);
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
  });
  modelRuntime.registerNativeProvider(faux.provider);
  await modelRuntime.setRuntimeApiKey(faux.provider.id, "faux-key");
  return { faux, modelRuntime };
}

describe("Pi message bridge", () => {
  it("maps domain user and assistant messages through Pi's convertToLlm", async () => {
    const { faux } = await fauxRuntime([]);
    const user = domainMessageToAgentMessage(
      new Message({ role: MessageRole.USER, content: "hello" }),
      faux.getModel(),
    );
    const assistant = domainMessageToAgentMessage(
      new Message({ role: MessageRole.ASSISTANT, content: "hi" }),
      faux.getModel(),
    );
    const messages = await transformContext([defined(user), defined(assistant)]);
    expect(convertToLlm(messages).map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(domainMessageToAgentMessage(new Message({ role: MessageRole.SYSTEM }), faux.getModel())).toBeUndefined();
  });

  it("drops failed assistant frames and honors cancellation", async () => {
    const failed = fauxAssistantMessage("failed", { stopReason: "error", errorMessage: "failure" });
    expect(await transformContext([failed])).toEqual([]);
    await expect(transformContext([], AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("headless Pi session", () => {
  it("overrides the coding prompt and disables all built-in coding tools", async () => {
    const { faux, modelRuntime } = await fauxRuntime([fauxAssistantMessage("ok")]);
    const session = await createHeadlessPiSession({
      modelRuntime,
      model: faux.getModel(),
      systemPrompt: "KookBot system prompt",
    });
    sessions.push(session);
    expect(session.systemPrompt).toContain(BASE_SYSTEM_PROMPT);
    expect(session.systemPrompt).toContain("KookBot system prompt");
    expect(session.getActiveToolNames()).not.toEqual(expect.arrayContaining([...DISABLED_CODING_TOOLS]));
    await session.prompt("hello");
  });

  it("keeps explicitly supplied function tools while coding tools stay disabled", async () => {
    const { faux, modelRuntime } = await fauxRuntime([
      fauxAssistantMessage(fauxToolCall("echo", { value: "x" }), { stopReason: "toolUse" }),
      fauxAssistantMessage("done"),
    ]);
    const runtimeEvents: string[] = [];
    let activeTools: string[] = [];
    const result = await new PiAgentRuntimeAdapter(async () => {
      const session = await createHeadlessPiSession({
        modelRuntime,
        model: faux.getModel(),
        customTools: [
          defineTool({
            name: "echo",
            label: "Echo",
            description: "Echo a value",
            parameters: Type.Object({ value: Type.String() }),
            execute: async (_id, params) => ({ content: [{ type: "text", text: params.value }], details: {} }),
          }),
        ],
      });
      activeTools = session.getActiveToolNames();
      return session;
    }).run({
      history: [],
      current: new Message({ role: MessageRole.USER, content: "use echo" }),
      onEvent: (event) => runtimeEvents.push(event.type),
    });
    expect(activeTools).toEqual(["echo"]);
    expect(runtimeEvents).toEqual(expect.arrayContaining(["tool_start", "tool_end"]));
    expect(result).toMatchObject({ status: "succeeded", text: "done" });
  });

  it("runs parallel and sequential tool batches according to governance metadata", async () => {
    for (const [mode, expectedMaxActive] of [
      ["parallel", 2],
      ["sequential", 1],
    ] as const) {
      const { faux, modelRuntime } = await fauxRuntime([
        fauxAssistantMessage([fauxToolCall("first", {}), fauxToolCall("second", {})], { stopReason: "toolUse" }),
        fauxAssistantMessage("done"),
      ]);
      let active = 0;
      let maxActive = 0;
      const makeTool = (name: string) =>
        defineTool({
          name,
          label: name,
          description: name,
          parameters: Type.Object({}),
          executionMode: mode,
          execute: async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
            return { content: [{ type: "text" as const, text: name }], details: {} };
          },
        });
      const session = await createHeadlessPiSession({
        modelRuntime,
        model: faux.getModel(),
        customTools: [makeTool("first"), makeTool("second")],
      });
      sessions.push(session);
      await session.prompt("run both");
      expect(maxActive, mode).toBe(expectedMaxActive);
    }
  });

  it("loads inline beforeToolCall policy hooks while filesystem extensions stay disabled", async () => {
    const { faux, modelRuntime } = await fauxRuntime([
      fauxAssistantMessage(fauxToolCall("blocked_tool", {}), { stopReason: "toolUse" }),
      fauxAssistantMessage("handled"),
    ]);
    const execute = vi.fn(async () => ({ content: [{ type: "text" as const, text: "unsafe" }], details: {} }));
    const session = await createHeadlessPiSession({
      modelRuntime,
      model: faux.getModel(),
      customTools: [
        defineTool({
          name: "blocked_tool",
          label: "Blocked tool",
          description: "Must be blocked",
          parameters: Type.Object({}),
          execute,
        }),
      ],
      extensions: [
        (pi) => {
          pi.on("tool_call", async () => ({ block: true, reason: "blocked by policy" }));
        },
      ],
    });
    sessions.push(session);
    await session.prompt("try it");
    expect(execute).not.toHaveBeenCalled();
    expect(session.state.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: "toolResult", isError: true })]),
    );
  });

  it("returns tool failures to the model as standard error results", async () => {
    const { faux, modelRuntime } = await fauxRuntime([
      fauxAssistantMessage(fauxToolCall("fails", {}), { stopReason: "toolUse" }),
      (context) => {
        expect(context.messages.at(-1)).toMatchObject({ role: "toolResult", toolName: "fails", isError: true });
        return fauxAssistantMessage("recovered");
      },
    ]);
    const result = await new PiAgentRuntimeAdapter(() =>
      createHeadlessPiSession({
        modelRuntime,
        model: faux.getModel(),
        customTools: [
          defineTool({
            name: "fails",
            label: "Fails",
            description: "Always fails",
            parameters: Type.Object({}),
            execute: async () => {
              throw new Error("controlled failure");
            },
          }),
        ],
      }),
    ).run({ history: [], current: new Message({ role: MessageRole.USER, content: "run it" }) });
    expect(result).toMatchObject({ status: "succeeded", text: "recovered" });
  });

  it("executes tools supplied for the current run and session", async () => {
    const { faux, modelRuntime } = await fauxRuntime([
      fauxAssistantMessage(fauxToolCall("read_input_file", { assetId: "input-a" }), { stopReason: "toolUse" }),
      fauxAssistantMessage("file read"),
    ]);
    const adapter = new PiAgentRuntimeAdapter(
      (_systemContext, customTools) =>
        createHeadlessPiSession({
          modelRuntime,
          model: faux.getModel(),
          ...(customTools === undefined ? {} : { customTools }),
        }),
      (context) => {
        expect(context).toEqual({ runId: "run-a", sessionId: "session-a" });
        return [
          defineTool({
            name: "read_input_file",
            label: "Read input file",
            description: "Read a scoped file",
            parameters: Type.Object({ assetId: Type.String() }),
            execute: async (_id, params) => ({
              content: [{ type: "text", text: `${context.sessionId}:${params.assetId}` }],
              details: {},
            }),
          }),
        ];
      },
    );

    const response = await adapter.run({
      runId: entityId("run-a"),
      sessionId: entityId("session-a"),
      history: [],
      current: new Message({ role: MessageRole.USER, content: "read the file" }),
    });

    expect(response).toMatchObject({ status: "succeeded", text: "file read" });
  });

  it("adds safe progress metadata for run-scoped tools", async () => {
    const { faux, modelRuntime } = await fauxRuntime([
      fauxAssistantMessage(fauxToolCall("status", {}), { stopReason: "toolUse" }),
      fauxAssistantMessage("done"),
    ]);
    const events: Array<{ type: string; safeProgressText?: string }> = [];
    const adapter = new PiAgentRuntimeAdapter(
      (_systemContext, customTools, extensions) =>
        createHeadlessPiSession({
          modelRuntime,
          model: faux.getModel(),
          ...(customTools === undefined ? {} : { customTools }),
          ...(extensions === undefined ? {} : { extensions }),
        }),
      () => ({
        tools: [
          defineTool({
            name: "status",
            label: "Status",
            description: "Status",
            parameters: Type.Object({}),
            execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
          }),
        ],
        progressByToolName: { status: "Checking status..." },
      }),
    );
    await adapter.run({
      runId: entityId("run-progress"),
      sessionId: entityId("session-progress"),
      history: [],
      current: new Message({ role: MessageRole.USER, content: "status" }),
      onEvent: (event) => void events.push(event),
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "tool_start", safeProgressText: "Checking status..." }),
    );
  });
});

describe("PiAgentRuntimeAdapter", () => {
  it("passes history/current input and emits ordered text deltas", async () => {
    let received: Context | undefined;
    const { faux, modelRuntime } = await fauxRuntime([
      (context) => {
        received = context;
        return fauxAssistantMessage("final answer");
      },
    ]);
    const adapter = new PiAgentRuntimeAdapter((systemContext) =>
      createHeadlessPiSession({
        modelRuntime,
        model: faux.getModel(),
        systemPrompt: `base\n${systemContext ?? ""}`,
      }),
    );
    const deltas: string[] = [];
    const result = await adapter.run({
      history: [
        new Message({ role: MessageRole.SYSTEM, content: "be concise" }),
        new Message({ role: MessageRole.USER, content: "previous question" }),
        new Message({ role: MessageRole.ASSISTANT, content: "previous answer" }),
      ],
      current: new Message({ role: MessageRole.USER, content: "current question" }),
      onEvent: (event) => {
        if (event.type === "text_delta") deltas.push(event.delta);
      },
    });

    expect(result).toMatchObject({ status: "succeeded", text: "final answer" });
    expect(deltas.join("")).toBe("final answer");
    expect(received?.systemPrompt).toContain("be concise");
    expect(received?.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  });

  it("maps AbortSignal to Pi cancellation", async () => {
    const { faux, modelRuntime } = await fauxRuntime([fauxAssistantMessage("a response that streams slowly")]);
    const controller = new AbortController();
    const events: string[] = [];
    const result = await new PiAgentRuntimeAdapter(() =>
      createHeadlessPiSession({ modelRuntime, model: faux.getModel() }),
    ).run({
      history: [],
      current: new Message({ role: MessageRole.USER, content: "cancel" }),
      signal: controller.signal,
      onEvent: (event) => {
        events.push(event.type);
        if (event.type === "text_delta") controller.abort();
      },
    });
    expect(result.status).toBe("cancelled");
    expect(events.at(-1)).toBe("end");
  });

  it("maps Pi error frames without throwing", async () => {
    const { faux, modelRuntime } = await fauxRuntime([
      fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider failed" }),
    ]);
    const result = await new PiAgentRuntimeAdapter(() =>
      createHeadlessPiSession({ modelRuntime, model: faux.getModel() }),
    ).run({ history: [], current: new Message({ role: MessageRole.USER, content: "hello" }) });
    expect(result).toMatchObject({ status: "failed", errorMessage: "provider failed" });
  });
});

describe("Pi model configuration", () => {
  it("reads provider, model, API key, and thinking level from environment", () => {
    expect(
      resolvePiModelConfig({
        PI_PROVIDER: "anthropic",
        PI_MODEL: "claude-test",
        PI_API_KEY: "secret",
        PI_THINKING_LEVEL: "high",
      }),
    ).toMatchObject({ provider: "anthropic", model: "claude-test", apiKey: "secret", thinkingLevel: "high" });
    expect(() => resolvePiModelConfig({ PI_PROVIDER: "x", PI_MODEL: "y", PI_THINKING_LEVEL: "invalid" })).toThrow(
      "invalid PI_THINKING_LEVEL",
    );
  });

  it("creates an offline headless session for an existing OpenAI-compatible configuration", async () => {
    const session = await createConfiguredPiSessionFactory({
      provider: "existing-provider",
      model: "existing-model",
      apiKey: "existing-key",
      baseUrl: "https://provider.example.com/v1",
      thinkingLevel: "low",
      systemPrompt: "Platform-specific instructions",
    })();
    sessions.push(session);
    expect(session.model).toMatchObject({ provider: "existing-provider", id: "existing-model" });
    expect(session.systemPrompt).toContain(BASE_SYSTEM_PROMPT);
    expect(session.systemPrompt).toContain("Platform-specific instructions");
    expect(session.getActiveToolNames()).toEqual([]);
  });
});
