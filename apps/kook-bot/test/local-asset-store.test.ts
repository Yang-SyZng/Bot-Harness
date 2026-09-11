import { mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { withUnitOfWork } from "@kookbot/application";
import { Attachment, entityId } from "@kookbot/domain";
import { MemoryStore, fakeUnitOfWorkFactory } from "@kookbot/persistence";
import { afterEach, describe, expect, it } from "vitest";

import { LocalAssetStore, SessionWorkspace } from "@kookbot/storage";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(
  body: string | Uint8Array = "hello",
  headers: Record<string, string> = { "content-type": "text/plain" },
) {
  const root = await mkdtemp(join(tmpdir(), "kookbot-assets-"));
  roots.push(root);
  const memory = new MemoryStore();
  const makeUnitOfWork = fakeUnitOfWorkFactory(memory);
  const store = new LocalAssetStore({
    root,
    makeUnitOfWork,
    maxAttachmentBytes: 32,
    maxArtifactBytes: 32,
    maxReadCharacters: 32,
    workspaceTtlMs: 1,
    fetch: async () => new Response(body, { status: 200, headers }),
  });
  return { root, memory, makeUnitOfWork, store };
}

describe("LocalAssetStore", () => {
  it("downloads, registers, lists, and reads a session input by assetId", async () => {
    const { store } = await fixture();
    const sessionId = entityId("session-a");
    const attachment = new Attachment({
      id: entityId("asset-a"),
      name: "notes.txt",
      sourceUrl: "https://example.com/notes.txt",
    });

    const asset = await store.downloadInput({ sessionId, attachment });

    expect(await store.readInputFile(sessionId, asset.id)).toBe("hello");
    expect(await store.listInputFiles(sessionId)).toEqual([
      expect.objectContaining({ assetId: asset.id, name: "notes.txt", role: "input", size: 5 }),
    ]);
    await expect(store.readInputFile(entityId("session-b"), asset.id)).rejects.toThrow("not available in this session");
  });

  it("treats generic KOOK upload MIME values as hints and validates the UTF-8 content", async () => {
    const sessionId = entityId("session-generic-mime");
    for (const [index, mimeType] of ["application/octet-stream", "image/upload"].entries()) {
      const { store } = await fixture("Higher mathematics exercises", { "content-type": mimeType });
      const asset = await store.downloadInput({
        sessionId,
        attachment: new Attachment({
          id: entityId(`asset-generic-${index}`),
          name: index === 0 ? "exercises.txt" : "exercises.md",
          sourceUrl: `https://example.com/exercises-${index}`,
        }),
      });
      expect(asset.mimeType).toBe(index === 0 ? "text/plain" : "text/markdown");
      await expect(store.readInputFile(sessionId, asset.id)).resolves.toBe("Higher mathematics exercises");
    }

    const invalidUtf8 = await fixture(new Uint8Array([0xc3, 0x28]), {
      "content-type": "application/octet-stream",
    });
    const invalidAsset = await invalidUtf8.store.downloadInput({
      sessionId,
      attachment: new Attachment({
        id: entityId("asset-invalid-utf8"),
        name: "invalid.txt",
        sourceUrl: "https://example.com/invalid.txt",
      }),
    });
    await expect(invalidUtf8.store.readInputFile(sessionId, invalidAsset.id)).rejects.toThrow("not valid UTF-8");
  });

  it("still rejects an explicitly binary MIME even when the filename has a text extension", async () => {
    const { store } = await fixture("not really an image", { "content-type": "image/png" });
    const sessionId = entityId("session-explicit-binary");
    const asset = await store.downloadInput({
      sessionId,
      attachment: new Attachment({
        id: entityId("asset-explicit-binary"),
        name: "misleading.txt",
        sourceUrl: "https://example.com/misleading.txt",
      }),
    });
    await expect(store.readInputFile(sessionId, asset.id)).rejects.toThrow("unsupported binary MIME type: image/png");
  });

  it("rejects unsafe names, oversized files, and unsupported binary input", async () => {
    const { store } = await fixture("too large", { "content-length": "100" });
    const sessionId = entityId("session-a");
    await expect(
      store.downloadInput({
        sessionId,
        attachment: new Attachment({
          id: entityId("asset-a"),
          name: "large.txt",
          sourceUrl: "https://example.com/large.txt",
        }),
      }),
    ).rejects.toThrow("exceeds 32 bytes");
    await expect(
      store.writeArtifact({ sessionId, runId: entityId("run-a"), name: "../escape.txt", content: "x" }),
    ).rejects.toThrow("single safe path segment");
    await expect(
      store.writeArtifact({ sessionId, runId: entityId("run-a"), name: "image.png", content: "x" }),
    ).rejects.toThrow("unsupported file type");
    await expect(
      store.writeArtifact({ sessionId, runId: entityId("run-a"), name: "large.txt", content: "x".repeat(33) }),
    ).rejects.toThrow("artifact exceeds 32 bytes");

    const streamed = await fixture("x".repeat(33));
    await expect(
      streamed.store.downloadInput({
        sessionId,
        attachment: new Attachment({
          id: entityId("asset-streamed"),
          name: "streamed.txt",
          sourceUrl: "https://example.com/streamed.txt",
        }),
      }),
    ).rejects.toThrow("attachment exceeds 32 bytes");

    const binary = await fixture(new Uint8Array([0, 1, 2]));
    const binaryAsset = await binary.store.downloadInput({
      sessionId,
      attachment: new Attachment({
        id: entityId("asset-binary"),
        name: "binary.txt",
        sourceUrl: "https://example.com/binary.txt",
      }),
    });
    await expect(binary.store.readInputFile(sessionId, binaryAsset.id)).rejects.toThrow("binary file content");
  });

  it("rejects a symlink substituted for an authorized file", async () => {
    const { root, store } = await fixture();
    const sessionId = entityId("session-a");
    const asset = await store.downloadInput({
      sessionId,
      attachment: new Attachment({
        id: entityId("asset-a"),
        name: "notes.txt",
        sourceUrl: "https://example.com/notes.txt",
      }),
    });
    const outside = join(root, "outside.txt");
    await writeFile(outside, "secret");
    await rm(asset.localPath ?? "missing");
    await symlink(outside, asset.localPath ?? "missing");

    await expect(store.readInputFile(sessionId, asset.id)).rejects.toThrow("not a regular file");
    expect(() => new SessionWorkspace(root, "../outside")).toThrow("unsupported characters");

    const output = await store.writeArtifact({
      sessionId,
      runId: entityId("run-a"),
      name: "answer.txt",
      content: "answer",
    });
    const [outputAsset] = await store.listOutputAssets(entityId("run-a"));
    await rm(outputAsset?.localPath ?? "missing");
    await symlink(outside, outputAsset?.localPath ?? "missing");
    await expect(store.listOutputAssets(entityId("run-a"))).rejects.toThrow("not a regular file");
    expect(output.name).toBe("answer.txt");
  });

  it("removes expired workspace data while retaining asset metadata", async () => {
    const { root, makeUnitOfWork, store } = await fixture();
    const sessionId = entityId("session-a");
    const output = await store.writeArtifact({
      sessionId,
      runId: entityId("run-a"),
      name: "answer.md",
      content: "result",
    });
    await utimes(join(root, sessionId), new Date(0), new Date(0));

    expect(await store.cleanupExpired()).toEqual([sessionId]);
    const retained = await withUnitOfWork(makeUnitOfWork, (uow) => uow.assets.get(output.assetId));
    expect(retained).toMatchObject({ id: output.assetId, status: "expired", localPath: undefined });
  });
});
