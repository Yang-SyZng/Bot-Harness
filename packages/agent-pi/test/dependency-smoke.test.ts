import { describe, expect, it } from "vitest";

import { loadMcpAdapter } from "../src/index.js";

describe("Pi integration package loading", () => {
  it("loads the TypeScript entry published by pi-mcp-adapter", async () => {
    const adapter = await loadMcpAdapter();
    expect(typeof adapter.createMcpAdapter).toBe("function");
    expect(typeof adapter.createMcpAdapter({ config: { mcpServers: {} } })).toBe("function");
  });
});
