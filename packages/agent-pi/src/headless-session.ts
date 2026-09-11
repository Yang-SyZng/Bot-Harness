import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { InMemoryCredentialStore, type Api, type Model } from "@earendil-works/pi-ai";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
  type AgentSession,
  type InlineExtension,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import { BASE_SYSTEM_PROMPT } from "./prompts/base-system-prompt.js";

export const DISABLED_CODING_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;

export interface HeadlessPiSessionOptions {
  readonly modelRuntime: ModelRuntime;
  readonly model: Model<Api>;
  readonly thinkingLevel?: ThinkingLevel;
  readonly systemPrompt?: string;
  readonly cwd?: string;
  readonly agentDir?: string;
  readonly customTools?: ToolDefinition[];
  readonly extensions?: InlineExtension[];
}

export async function createHeadlessPiSession(options: HeadlessPiSessionOptions): Promise<AgentSession> {
  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? cwd;
  const settingsManager = SettingsManager.inMemory({
    retry: { enabled: false },
    compaction: { enabled: false },
    defaultTools: [],
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    ...(options.extensions === undefined ? {} : { extensionFactories: options.extensions }),
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => [BASE_SYSTEM_PROMPT, options.systemPrompt].filter(Boolean).join("\n\n"),
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime: options.modelRuntime,
    model: options.model,
    ...(options.thinkingLevel === undefined ? {} : { thinkingLevel: options.thinkingLevel }),
    noTools: "builtin",
    ...(options.customTools === undefined ? {} : { customTools: options.customTools }),
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager,
  });
  const forbidden = session
    .getActiveToolNames()
    .filter((name) => (DISABLED_CODING_TOOLS as readonly string[]).includes(name));
  if (forbidden.length > 0) {
    session.dispose();
    throw new Error(`coding tools unexpectedly enabled: ${forbidden.join(", ")}`);
  }
  return session;
}

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export interface PiModelConfig {
  readonly provider: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly api?: Api;
  readonly thinkingLevel?: ThinkingLevel;
  readonly systemPrompt?: string;
  readonly cwd?: string;
  readonly agentDir?: string;
}

export function resolvePiModelConfig(env: NodeJS.ProcessEnv = process.env): PiModelConfig {
  const provider = env.PI_PROVIDER?.trim() || env.LLM_PROVIDER?.trim() || "openai";
  const model = env.PI_MODEL?.trim() || env.LLM_MODEL_ID?.trim();
  if (!model) throw new Error("PI_MODEL or LLM_MODEL_ID is required");
  const rawThinking = env.PI_THINKING_LEVEL?.trim();
  if (rawThinking && !(THINKING_LEVELS as readonly string[]).includes(rawThinking)) {
    throw new Error(`invalid PI_THINKING_LEVEL: ${rawThinking}`);
  }
  const apiKey = (env.PI_API_KEY ?? env.API_KEY)?.trim();
  const baseUrl = (env.PI_BASE_URL ?? env.BASE_URL)?.trim();
  return {
    provider,
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(env.PI_API?.trim() ? { api: env.PI_API.trim() } : {}),
    ...(rawThinking ? { thinkingLevel: rawThinking as ThinkingLevel } : {}),
    ...(env.PI_SYSTEM_PROMPT?.trim() ? { systemPrompt: env.PI_SYSTEM_PROMPT.trim() } : {}),
  };
}

export type PiSessionFactory = (
  systemContext?: string,
  customTools?: ToolDefinition[],
  extensions?: InlineExtension[],
) => Promise<AgentSession>;

export function createConfiguredPiSessionFactory(config: PiModelConfig): PiSessionFactory {
  const initialized = (async () => {
    const modelRuntime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      allowModelNetwork: false,
    });
    if (config.baseUrl && !modelRuntime.getModel(config.provider, config.model)) {
      const api = config.api ?? "openai-completions";
      modelRuntime.registerProvider(config.provider, {
        api,
        baseUrl: config.baseUrl,
        models: [
          {
            id: config.model,
            name: config.model,
            api,
            reasoning: true,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128_000,
            maxTokens: 16_384,
            baseUrl: config.baseUrl,
          },
        ],
      });
    }
    if (config.apiKey) await modelRuntime.setRuntimeApiKey(config.provider, config.apiKey);
    const model = modelRuntime.getModel(config.provider, config.model);
    if (!model) throw new Error(`Pi model not found: ${config.provider}/${config.model}`);
    return { modelRuntime, model };
  })();

  return async (systemContext, customTools, extensions) => {
    const { modelRuntime, model } = await initialized;
    const systemPrompt = [config.systemPrompt, systemContext].filter(Boolean).join("\n\n");
    return createHeadlessPiSession({
      modelRuntime,
      model,
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(customTools === undefined ? {} : { customTools }),
      ...(extensions === undefined ? {} : { extensions }),
      ...(config.thinkingLevel === undefined ? {} : { thinkingLevel: config.thinkingLevel }),
      ...(config.cwd === undefined ? {} : { cwd: config.cwd }),
      ...(config.agentDir === undefined ? {} : { agentDir: config.agentDir }),
    });
  };
}
