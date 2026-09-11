import { entityId } from "@kookbot/domain";
import type { AssetStore } from "@kookbot/storage";
import { describe, expect, it, vi } from "vitest";

import { createSessionFileTools } from "../src/index.js";

describe("session file tools", () => {
  it("exposes only asset-scoped file operations", async () => {
    const store: AssetStore = {
      downloadInput: vi.fn(),
      listInputFiles: vi.fn(async () => []),
      getFileMetadata: vi.fn(),
      readInputFile: vi.fn(async () => "contents"),
      writeArtifact: vi.fn(async (input) => ({
        assetId: entityId("output-a"),
        name: input.name,
        mimeType: "text/plain",
        size: input.content.length,
        sha256: "digest",
        role: "output" as const,
      })),
      listOutputAssets: vi.fn(async () => []),
      cleanupExpired: vi.fn(async () => []),
    };
    const tools = createSessionFileTools(store, { sessionId: entityId("session-a"), runId: entityId("run-a") });

    expect(tools.map((tool) => tool.name)).toEqual([
      "list_input_files",
      "read_input_file",
      "get_file_metadata",
      "write_artifact",
    ]);
    const read = tools.find((tool) => tool.name === "read_input_file");
    const write = tools.find((tool) => tool.name === "write_artifact");
    await read?.execute("call-read", { assetId: "input-a" }, undefined, undefined, {} as never);
    await write?.execute("call-write", { name: "answer.txt", content: "answer" }, undefined, undefined, {} as never);
    expect(store.readInputFile).toHaveBeenCalledWith("session-a", "input-a");
    expect(store.writeArtifact).toHaveBeenCalledWith({
      sessionId: "session-a",
      runId: "run-a",
      name: "answer.txt",
      content: "answer",
    });
  });
});
