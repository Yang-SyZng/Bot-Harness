import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export interface FileDigest {
  readonly size: number;
  readonly sha256: string;
}

export async function digestFile(path: string): Promise<FileDigest> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    hash.update(bytes);
  }
  return { size, sha256: hash.digest("hex") };
}
