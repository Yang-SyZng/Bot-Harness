import { createHash } from "node:crypto";
import { open, readFile, rm } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";

import { type UnitOfWorkFactory, withUnitOfWork } from "@kookbot/application";
import { Asset, AssetRole, type Attachment, type EntityId, entityId, newId, nowMs } from "@kookbot/domain";

import type { AssetMetadata, AssetStore, DownloadInput, WriteArtifactInput } from "./asset-store.js";
import { AssetAccessError, FilePolicyError, UnsupportedFileTypeError } from "./errors.js";
import { SessionWorkspace, assertSafeFileName } from "./session-workspace.js";

const TEXT_TYPES: Readonly<Record<string, string>> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
};

const GENERIC_UPLOAD_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/octet-stream",
  "binary/octet-stream",
  "image/upload",
]);

export interface LocalAssetStoreOptions {
  readonly root: string;
  readonly makeUnitOfWork: UnitOfWorkFactory;
  readonly maxAttachmentBytes: number;
  readonly maxArtifactBytes: number;
  readonly maxReadCharacters?: number;
  readonly workspaceTtlMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
}

function normalizedMimeType(value?: string): string | undefined {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  return normalized || undefined;
}

function inferredMimeType(name: string, declared?: string): string {
  const extensionMime = TEXT_TYPES[extname(name).toLowerCase()];
  const normalizedDeclared = normalizedMimeType(declared);
  if (!normalizedDeclared || GENERIC_UPLOAD_MIME_TYPES.has(normalizedDeclared)) {
    return extensionMime || "application/octet-stream";
  }
  return normalizedDeclared;
}

function requireTextType(name: string, mimeType?: string): string {
  const extension = extname(name).toLowerCase();
  const inferred = TEXT_TYPES[extension];
  if (!inferred) {
    throw new UnsupportedFileTypeError(
      `unsupported file type ${extension || "without extension"}; allowed: .txt, .md, .json, .csv`,
    );
  }
  const normalizedMime = normalizedMimeType(mimeType);
  if (
    normalizedMime &&
    !GENERIC_UPLOAD_MIME_TYPES.has(normalizedMime) &&
    !normalizedMime.startsWith("text/") &&
    normalizedMime !== "application/json"
  ) {
    throw new UnsupportedFileTypeError(`unsupported binary MIME type: ${normalizedMime}`);
  }
  return !normalizedMime || GENERIC_UPLOAD_MIME_TYPES.has(normalizedMime) ? inferred : normalizedMime;
}

function attachmentName(attachment: Attachment): string {
  if (attachment.name) return attachment.name;
  if (attachment.sourceUrl) {
    try {
      const candidate = basename(new URL(attachment.sourceUrl).pathname);
      if (candidate) return candidate;
    } catch {
      // URL validation below returns the stable policy error.
    }
  }
  return `${attachment.id}.bin`;
}

function metadata(asset: Asset): AssetMetadata {
  if (!asset.originalName || !asset.mimeType || asset.size === undefined || !asset.sha256 || !asset.role) {
    throw new AssetAccessError(`asset ${asset.id} has incomplete metadata`);
  }
  return {
    assetId: asset.id,
    name: asset.originalName,
    mimeType: asset.mimeType,
    size: asset.size,
    sha256: asset.sha256,
    role: asset.role,
  };
}

export class LocalAssetStore implements AssetStore {
  readonly #root: string;
  readonly #makeUnitOfWork: UnitOfWorkFactory;
  readonly #maxAttachmentBytes: number;
  readonly #maxArtifactBytes: number;
  readonly #maxReadCharacters: number;
  readonly #workspaceTtlMs: number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => number;

  constructor(options: LocalAssetStoreOptions) {
    this.#root = resolve(options.root);
    this.#makeUnitOfWork = options.makeUnitOfWork;
    this.#maxAttachmentBytes = options.maxAttachmentBytes;
    this.#maxArtifactBytes = options.maxArtifactBytes;
    this.#maxReadCharacters = options.maxReadCharacters ?? 100_000;
    this.#workspaceTtlMs = options.workspaceTtlMs ?? 24 * 60 * 60 * 1000;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? Date.now;
  }

  async downloadInput(input: DownloadInput): Promise<Asset> {
    const existing = await withUnitOfWork(this.#makeUnitOfWork, (uow) => uow.assets.get(input.attachment.id));
    if (existing) {
      if (existing.sessionId !== input.sessionId || existing.role !== AssetRole.INPUT) {
        throw new AssetAccessError(`asset ${existing.id} belongs to another session`);
      }
      return existing;
    }
    if (!input.attachment.sourceUrl) throw new FilePolicyError("attachment has no download URL");
    const url = new URL(input.attachment.sourceUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new FilePolicyError("attachment URL must use http or https");
    }
    const name = attachmentName(input.attachment);
    assertSafeFileName(name);
    if (input.attachment.size !== undefined && input.attachment.size > this.#maxAttachmentBytes) {
      throw new FilePolicyError(`attachment exceeds ${this.#maxAttachmentBytes} bytes`);
    }
    const workspace = new SessionWorkspace(this.#root, input.sessionId);
    const path = await workspace.createFilePath("inputs", input.attachment.id, name);
    const response = await this.#fetch(url, {
      redirect: "follow",
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    if (!response.ok) throw new Error(`attachment download failed with HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > this.#maxAttachmentBytes) {
      throw new FilePolicyError(`attachment exceeds ${this.#maxAttachmentBytes} bytes`);
    }
    if (!response.body) throw new Error("attachment download returned no body");

    const handle = await open(path, "wx", 0o600);
    const hash = createHash("sha256");
    let size = 0;
    let failed = true;
    try {
      const reader = response.body.getReader();
      while (true) {
        input.signal?.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > this.#maxAttachmentBytes)
          throw new FilePolicyError(`attachment exceeds ${this.#maxAttachmentBytes} bytes`);
        hash.update(chunk.value);
        await handle.writeFile(chunk.value);
      }
      failed = false;
    } finally {
      await handle.close();
      if (failed) await rm(path, { force: true });
    }
    const asset = new Asset({
      id: input.attachment.id,
      originalName: name,
      mimeType: inferredMimeType(name, input.attachment.mimeType ?? response.headers.get("content-type") ?? undefined),
      size,
      sha256: hash.digest("hex"),
      source: url.toString(),
      storageKey: relative(this.#root, path),
      localPath: path,
      sessionId: input.sessionId,
      role: AssetRole.INPUT,
      safeToShare: false,
      status: "ready",
      createdAt: nowMs(),
    });
    await withUnitOfWork(this.#makeUnitOfWork, (uow) => uow.assets.add(asset));
    return asset.clone();
  }

  async listInputFiles(sessionId: EntityId): Promise<AssetMetadata[]> {
    const assets = await withUnitOfWork(this.#makeUnitOfWork, (uow) =>
      uow.assets.listBySession(sessionId, AssetRole.INPUT),
    );
    return assets.map(metadata);
  }

  async getFileMetadata(sessionId: EntityId, assetId: EntityId): Promise<AssetMetadata> {
    return metadata(await this.#authorizedAsset(sessionId, assetId));
  }

  async readInputFile(sessionId: EntityId, assetId: EntityId): Promise<string> {
    const asset = await this.#authorizedAsset(sessionId, assetId);
    if (asset.role !== AssetRole.INPUT) throw new AssetAccessError("only input assets can be read");
    if (!asset.originalName || !asset.localPath)
      throw new AssetAccessError("input asset is no longer available locally");
    requireTextType(asset.originalName, asset.mimeType);
    const workspace = new SessionWorkspace(this.#root, sessionId);
    await workspace.assertReadableFile(asset.localPath);
    if ((asset.size ?? 0) > this.#maxAttachmentBytes) throw new FilePolicyError("input asset exceeds its size limit");
    const bytes = await readFile(asset.localPath);
    if (bytes.includes(0)) throw new UnsupportedFileTypeError("binary file content is not supported");
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new UnsupportedFileTypeError("input file is not valid UTF-8 text");
    }
    if (content.length > this.#maxReadCharacters) {
      throw new FilePolicyError(`input file exceeds the ${this.#maxReadCharacters}-character read limit`);
    }
    return content;
  }

  async writeArtifact(input: WriteArtifactInput): Promise<AssetMetadata> {
    assertSafeFileName(input.name);
    const mimeType = requireTextType(input.name, input.mimeType);
    const bytes = Buffer.from(input.content, "utf8");
    if (bytes.byteLength > this.#maxArtifactBytes) {
      throw new FilePolicyError(`artifact exceeds ${this.#maxArtifactBytes} bytes`);
    }
    const id = newId();
    const workspace = new SessionWorkspace(this.#root, input.sessionId);
    const path = await workspace.createFilePath("outputs", id, input.name);
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
    const asset = new Asset({
      id,
      originalName: input.name,
      mimeType,
      size: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source: "agent_generated",
      storageKey: relative(this.#root, path),
      localPath: path,
      sessionId: input.sessionId,
      runId: input.runId,
      role: AssetRole.OUTPUT,
      safeToShare: true,
      status: "ready",
      createdAt: nowMs(),
    });
    await withUnitOfWork(this.#makeUnitOfWork, (uow) => uow.assets.add(asset));
    return metadata(asset);
  }

  async listOutputAssets(runId: EntityId): Promise<Asset[]> {
    const assets = await withUnitOfWork(this.#makeUnitOfWork, (uow) => uow.assets.listByRun(runId, AssetRole.OUTPUT));
    const shareable = assets.filter((asset) => asset.safeToShare && asset.status === "ready");
    for (const asset of shareable) {
      if (!asset.sessionId || !asset.localPath) throw new AssetAccessError(`output asset ${asset.id} is unavailable`);
      await new SessionWorkspace(this.#root, asset.sessionId).assertReadableFile(asset.localPath);
    }
    return shareable;
  }

  async cleanupExpired(): Promise<readonly EntityId[]> {
    const removed = await SessionWorkspace.cleanupExpired(this.#root, this.#now() - this.#workspaceTtlMs);
    for (const sessionId of removed) {
      const id = entityId(sessionId);
      await withUnitOfWork(this.#makeUnitOfWork, async (uow) => {
        for (const asset of await uow.assets.listBySession(id)) {
          asset.localPath = undefined;
          asset.status = "expired";
          await uow.assets.save(asset);
        }
      });
    }
    return removed.map(entityId);
  }

  async #authorizedAsset(sessionId: EntityId, assetId: EntityId): Promise<Asset> {
    const asset = await withUnitOfWork(this.#makeUnitOfWork, (uow) => uow.assets.get(assetId));
    if (!asset || asset.sessionId !== sessionId)
      throw new AssetAccessError(`asset ${assetId} is not available in this session`);
    return asset;
  }
}
