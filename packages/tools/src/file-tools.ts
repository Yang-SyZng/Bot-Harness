import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { EntityId } from "@kookbot/domain";
import type { AssetStore } from "@kookbot/storage";
import { Type } from "typebox";

import type { ManagedTool } from "./tool-registry.js";

export interface FileToolContext {
  readonly sessionId: EntityId;
  readonly runId: EntityId;
}

function result(value: unknown): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> } {
  return { content: [{ type: "text", text: JSON.stringify(value) }], details: {} };
}

export function createSessionFileTools(store: AssetStore, context: FileToolContext): ToolDefinition[] {
  return [
    defineTool({
      name: "list_input_files",
      label: "List input files",
      description: "List files uploaded by the user to the current session. Returns authorized asset IDs.",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params, signal) => {
        signal?.throwIfAborted();
        return result(await store.listInputFiles(context.sessionId));
      },
    }),
    defineTool({
      name: "read_input_file",
      label: "Read input file",
      description: "Read an allowed UTF-8 text input file from the current session by assetId.",
      parameters: Type.Object({ assetId: Type.String({ minLength: 1 }) }),
      execute: async (_toolCallId, params, signal) => {
        signal?.throwIfAborted();
        return result({
          assetId: params.assetId,
          content: await store.readInputFile(context.sessionId, params.assetId as EntityId),
        });
      },
    }),
    defineTool({
      name: "get_file_metadata",
      label: "Get file metadata",
      description: "Get safe metadata for an input or output file authorized for the current session.",
      parameters: Type.Object({ assetId: Type.String({ minLength: 1 }) }),
      execute: async (_toolCallId, params, signal) => {
        signal?.throwIfAborted();
        return result(await store.getFileMetadata(context.sessionId, params.assetId as EntityId));
      },
    }),
    defineTool({
      name: "write_artifact",
      label: "Write output file",
      description: "Create a UTF-8 .txt, .md, .json, or .csv output file for the user in the current session.",
      parameters: Type.Object({
        name: Type.String({ minLength: 1, maxLength: 255 }),
        content: Type.String(),
        mimeType: Type.Optional(Type.String({ minLength: 1, maxLength: 127 })),
      }),
      execute: async (_toolCallId, params, signal) => {
        signal?.throwIfAborted();
        return result(
          await store.writeArtifact({
            sessionId: context.sessionId,
            runId: context.runId,
            name: params.name,
            content: params.content,
            ...(params.mimeType === undefined ? {} : { mimeType: params.mimeType }),
          }),
        );
      },
    }),
  ];
}

export function createManagedSessionFileTools(store: AssetStore, context: FileToolContext): ManagedTool[] {
  const risks = ["read_only", "read_only", "read_only", "write"] as const;
  const progress = [
    "Checking uploaded files...",
    "Reading the uploaded file...",
    "Checking file metadata...",
    "Generating the requested file...",
  ];
  return createSessionFileTools(store, context).map((definition, index) => ({
    definition,
    risk: risks[index] ?? "read_only",
    ...(progress[index] === undefined ? {} : { progressText: progress[index] }),
  }));
}
