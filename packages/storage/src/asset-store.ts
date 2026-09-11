import type { Asset, Attachment, EntityId } from "@kookbot/domain";

export interface AssetMetadata {
  readonly assetId: EntityId;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly sha256: string;
  readonly role: "input" | "output";
}

export interface DownloadInput {
  readonly sessionId: EntityId;
  readonly attachment: Attachment;
  readonly signal?: AbortSignal;
}

export interface WriteArtifactInput {
  readonly sessionId: EntityId;
  readonly runId: EntityId;
  readonly name: string;
  readonly content: string;
  readonly mimeType?: string;
}

export interface AssetStore {
  downloadInput(input: DownloadInput): Promise<Asset>;
  listInputFiles(sessionId: EntityId): Promise<AssetMetadata[]>;
  getFileMetadata(sessionId: EntityId, assetId: EntityId): Promise<AssetMetadata>;
  readInputFile(sessionId: EntityId, assetId: EntityId): Promise<string>;
  writeArtifact(input: WriteArtifactInput): Promise<AssetMetadata>;
  listOutputAssets(runId: EntityId): Promise<Asset[]>;
  cleanupExpired(): Promise<readonly EntityId[]>;
}
