import { describe, expect, it } from "vitest";

import { createJsonLogger } from "../src/bootstrap/json-logger.js";

describe("json logger", () => {
  it("emits a stable structured record and redacts secret fields", () => {
    const lines: string[] = [];
    const logger = createJsonLogger(
      "test-service",
      (line) => lines.push(line),
      () => new Date("2026-09-09T00:00:00Z"),
    );
    logger.child({ runId: "run-1" }).info("run.started", {
      apiKey: "must-not-leak",
      nested: { platform_token: "also-secret", safe: "visible" },
    });

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(record).toMatchObject({
      timestamp: "2026-09-09T00:00:00.000Z",
      level: "info",
      service: "test-service",
      event: "run.started",
      runId: "run-1",
      apiKey: "[REDACTED]",
      nested: { platform_token: "[REDACTED]", safe: "visible" },
    });
    expect(lines[0]).not.toContain("must-not-leak");
    expect(lines[0]).not.toContain("also-secret");
  });
});
