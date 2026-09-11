import { lstat, mkdir, readdir, realpath, rm, utimes } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { AssetAccessError, FilePolicyError } from "./errors.js";

const SAFE_IDENTIFIER = /^[a-zA-Z0-9_-]+$/u;

function assertSafeIdentifier(value: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(value)) throw new FilePolicyError(`${label} contains unsupported characters`);
}

export function assertSafeFileName(name: string): void {
  const hasControlCharacter = [...name].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (
    !name ||
    name === "." ||
    name === ".." ||
    isAbsolute(name) ||
    name.includes("/") ||
    name.includes("\\") ||
    name.length > 255 ||
    hasControlCharacter
  ) {
    throw new FilePolicyError("file name must be a single safe path segment");
  }
}

function isWithin(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

async function assertRealDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new FilePolicyError(`unsafe workspace directory: ${path}`);
}

export class SessionWorkspace {
  readonly root: string;
  readonly sessionId: string;
  readonly path: string;

  constructor(root: string, sessionId: string) {
    assertSafeIdentifier(sessionId, "sessionId");
    this.root = resolve(root);
    this.sessionId = sessionId;
    this.path = resolve(this.root, sessionId);
    if (!isWithin(this.root, this.path)) throw new FilePolicyError("session workspace escapes its root");
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await assertRealDirectory(this.root);
    await mkdir(this.path, { recursive: true, mode: 0o700 });
    await assertRealDirectory(this.path);
    for (const role of ["inputs", "outputs"] as const) {
      const directory = resolve(this.path, role);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await assertRealDirectory(directory);
    }
  }

  async createAssetDirectory(role: "inputs" | "outputs", assetId: string): Promise<string> {
    assertSafeIdentifier(assetId, "assetId");
    await this.initialize();
    const roleDirectory = resolve(this.path, role);
    await assertRealDirectory(roleDirectory);
    const directory = resolve(roleDirectory, assetId);
    if (!isWithin(roleDirectory, directory)) throw new FilePolicyError("asset directory escapes its workspace");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await assertRealDirectory(directory);
    const now = new Date();
    await utimes(this.path, now, now);
    return directory;
  }

  async createFilePath(role: "inputs" | "outputs", assetId: string, name: string): Promise<string> {
    assertSafeFileName(name);
    const directory = await this.createAssetDirectory(role, assetId);
    const path = resolve(directory, name);
    if (!isWithin(directory, path)) throw new FilePolicyError("file path escapes its asset directory");
    return path;
  }

  async assertReadableFile(path: string): Promise<void> {
    const candidate = resolve(path);
    if (!isWithin(this.path, candidate)) throw new AssetAccessError("asset path is outside its session workspace");
    const info = await lstat(candidate);
    if (info.isSymbolicLink() || !info.isFile()) throw new AssetAccessError("asset path is not a regular file");
    const actual = await realpath(candidate);
    const workspace = await realpath(this.path);
    if (!isWithin(workspace, actual)) throw new AssetAccessError("asset resolves outside its session workspace");
  }

  static async cleanupExpired(root: string, cutoffTime: number): Promise<string[]> {
    const workspaceRoot = resolve(root);
    await mkdir(workspaceRoot, { recursive: true, mode: 0o700 });
    await assertRealDirectory(workspaceRoot);
    const removed: string[] = [];
    for (const entry of await readdir(workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !SAFE_IDENTIFIER.test(entry.name)) continue;
      const candidate = resolve(workspaceRoot, entry.name);
      if (!isWithin(workspaceRoot, candidate)) continue;
      const info = await lstat(candidate);
      if (info.isSymbolicLink() || !info.isDirectory()) continue;
      if (info.mtimeMs >= cutoffTime) continue;
      await rm(candidate, { recursive: true, force: false });
      removed.push(entry.name);
    }
    return removed;
  }
}
