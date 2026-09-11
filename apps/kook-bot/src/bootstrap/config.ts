import { inspect } from "node:util";
import { normalizeSystemPromptExtra } from "../prompts/system-prompt.js";

const REDACTED = "[REDACTED]";

export class Secret {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static from(name: string, value: string | undefined): Secret {
    const normalized = value?.trim();
    if (!normalized) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return new Secret(normalized);
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): string {
    return REDACTED;
  }

  toString(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}

export interface RuntimeConfig {
  readonly platform: "kook";
  readonly platformToken: Secret;
  readonly apiKey: Secret;
  readonly baseUrl: URL;
  readonly llmProvider: string;
  readonly llmModelId: string;
  readonly piApi: string;
  readonly thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  readonly language: "CN" | "EN";
  readonly systemPromptExtra?: string;
  readonly workspaceRoot: string;
  readonly workspaceTtlMs: number;
  readonly maxFileReadCharacters: number;
  readonly maxAttachmentBytes: number;
  readonly maxArtifactBytes: number;
  readonly toolTimeoutMs: number;
  readonly maxToolCallsPerRun: number;
  readonly maxToolResultCharacters: number;
}

function required(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return normalized;
}

function positiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function httpUrl(name: string, value: string | undefined): URL {
  const parsed = new URL(required(name, value));
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }
  return parsed;
}

function systemPromptExtra(env: NodeJS.ProcessEnv): string | undefined {
  const value = normalizeSystemPromptExtra(env.SYSTEM_PROMPT_EXTRA);
  if (!value) return undefined;
  for (const secret of [env.API_KEY, env.PLATFORM_TOKEN]) {
    const normalizedSecret = secret?.trim();
    if (normalizedSecret && value.includes(normalizedSecret)) {
      throw new Error("SYSTEM_PROMPT_EXTRA must not contain configured secrets");
    }
  }
  return value;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const language = env.LANGUAGE?.trim().toUpperCase() || "CN";
  if (language !== "CN" && language !== "EN") {
    throw new Error("LANGUAGE must be CN or EN");
  }
  const platform = required("PLATFORM", env.PLATFORM).toLowerCase();
  if (platform !== "kook") throw new Error("PLATFORM must be kook");
  const thinkingLevel = env.PI_THINKING_LEVEL?.trim().toLowerCase() || "medium";
  if (!["off", "minimal", "low", "medium", "high", "xhigh"].includes(thinkingLevel)) {
    throw new Error("PI_THINKING_LEVEL must be off, minimal, low, medium, high, or xhigh");
  }
  const promptExtra = systemPromptExtra(env);

  return Object.freeze({
    platform,
    platformToken: Secret.from("PLATFORM_TOKEN", env.PLATFORM_TOKEN),
    apiKey: Secret.from("API_KEY", env.API_KEY),
    baseUrl: httpUrl("BASE_URL", env.BASE_URL),
    llmProvider: env.PI_PROVIDER?.trim() || env.LLM_PROVIDER?.trim() || "openai",
    llmModelId: required("LLM_MODEL_ID", env.LLM_MODEL_ID),
    piApi: env.PI_API?.trim() || "openai-completions",
    thinkingLevel: thinkingLevel as RuntimeConfig["thinkingLevel"],
    language,
    ...(promptExtra === undefined ? {} : { systemPromptExtra: promptExtra }),
    workspaceRoot: env.WORKSPACE_ROOT?.trim() || "workspaces",
    workspaceTtlMs: positiveInteger("WORKSPACE_TTL_MS", env.WORKSPACE_TTL_MS, 24 * 60 * 60 * 1000),
    maxFileReadCharacters: positiveInteger("MAX_FILE_READ_CHARACTERS", env.MAX_FILE_READ_CHARACTERS, 100_000),
    maxAttachmentBytes: positiveInteger("MAX_ATTACHMENT_BYTES", env.MAX_ATTACHMENT_BYTES, 10 * 1024 * 1024),
    maxArtifactBytes: positiveInteger("MAX_ARTIFACT_BYTES", env.MAX_ARTIFACT_BYTES, 10 * 1024 * 1024),
    toolTimeoutMs: positiveInteger("TOOL_TIMEOUT_MS", env.TOOL_TIMEOUT_MS, 15_000),
    maxToolCallsPerRun: positiveInteger("MAX_TOOL_CALLS_PER_RUN", env.MAX_TOOL_CALLS_PER_RUN, 12),
    maxToolResultCharacters: positiveInteger("MAX_TOOL_RESULT_CHARACTERS", env.MAX_TOOL_RESULT_CHARACTERS, 20_000),
  });
}
