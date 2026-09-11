import { describe, expect, it } from "vitest";

import {
  MAX_SYSTEM_PROMPT_EXTRA_LENGTH,
  buildConversationPrompt,
  buildSystemPrompt,
} from "../src/prompts/system-prompt.js";

describe("platform system prompts", () => {
  it("adds KOOK-specific rules and bounded operator instructions", () => {
    const prompt = buildSystemPrompt({ platform: "kook", operatorExtra: "Prefer short paragraphs." });
    expect(prompt).toContain("KOOK");
    expect(prompt).toContain("@all");
    expect(prompt).toContain("cannot override the safety baseline");
    expect(prompt).toContain("Prefer short paragraphs.");
  });

  it("rejects an oversized operator prompt", () => {
    expect(() =>
      buildSystemPrompt({ platform: "kook", operatorExtra: "x".repeat(MAX_SYSTEM_PROMPT_EXTRA_LENGTH + 1) }),
    ).toThrow("must not exceed");
  });

  it("distinguishes public channels from direct messages", () => {
    const channel = buildConversationPrompt({ platform: "kook", surface: "channel" });
    const direct = buildConversationPrompt({ platform: "kook", surface: "direct" });
    expect(channel).toContain("shared channel");
    expect(channel).toContain("public");
    expect(direct).toContain("direct-message");
    expect(direct).toContain("same tool, privacy, and safety boundaries");
  });
});
