import { describe, expect, it } from "vitest";

import { loadRuntimeConfig, Secret } from "../src/bootstrap/config.js";

const validEnv = {
  PLATFORM: "kook",
  PLATFORM_TOKEN: "kook-token",
  API_KEY: "provider-key",
  BASE_URL: "https://provider.example.com/v1",
  LLM_MODEL_ID: "model-name",
};

describe("runtime config", () => {
  it("loads required values and applies safe defaults", () => {
    const config = loadRuntimeConfig(validEnv);
    expect(config.llmModelId).toBe("model-name");
    expect(config.language).toBe("CN");
    expect(config.maxAttachmentBytes).toBe(10 * 1024 * 1024);
  });

  it("fails fast when a required secret is missing", () => {
    expect(() => loadRuntimeConfig({ ...validEnv, API_KEY: "" })).toThrow("API_KEY");
  });

  it("redacts secrets during serialization and inspection", () => {
    const secret = Secret.from("TOKEN", "do-not-log");
    expect(String(secret)).toBe("[REDACTED]");
    expect(JSON.stringify({ secret })).not.toContain("do-not-log");
    expect(secret.reveal()).toBe("do-not-log");
  });

  it("rejects invalid limits and URL protocols", () => {
    expect(() => loadRuntimeConfig({ ...validEnv, MAX_ARTIFACT_BYTES: "0" })).toThrow("positive integer");
    expect(() => loadRuntimeConfig({ ...validEnv, BASE_URL: "file:///tmp/model" })).toThrow("http or https");
  });
});
