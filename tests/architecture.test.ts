import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
};

const root = new URL("..", import.meta.url).pathname;
const packageDirectories = ["domain", "application", "agent-pi", "tools", "platform-kook", "persistence", "storage"];

async function manifest(directory: string): Promise<Manifest> {
  return JSON.parse(await readFile(join(root, "packages", directory, "package.json"), "utf8")) as Manifest;
}

describe("workspace architecture", () => {
  it("keeps domain free of runtime dependencies", async () => {
    expect((await manifest("domain")).dependencies).toBeUndefined();
  });

  it("keeps application dependent only on domain", async () => {
    expect(Object.keys((await manifest("application")).dependencies ?? {})).toEqual(["@kookbot/domain"]);
  });

  it("does not contain cycles between internal packages", async () => {
    const manifests = await Promise.all(packageDirectories.map(manifest));
    const graph = new Map(
      manifests.map((item) => [
        item.name,
        Object.keys(item.dependencies ?? {}).filter((name) => name.startsWith("@kookbot/")),
      ]),
    );
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (name: string): void => {
      if (visiting.has(name)) {
        throw new Error(`Dependency cycle detected at ${name}`);
      }
      if (visited.has(name)) {
        return;
      }
      visiting.add(name);
      for (const dependency of graph.get(name) ?? []) {
        visit(dependency);
      }
      visiting.delete(name);
      visited.add(name);
    };

    for (const name of graph.keys()) {
      visit(name);
    }
    expect(visited.size).toBe(graph.size);
  });

  it("pins external integration dependencies exactly", async () => {
    expect((await manifest("platform-kook")).dependencies?.["@gedaxin/kook"]).toBe("catalog:");
    expect((await manifest("agent-pi")).dependencies?.["pi-mcp-adapter"]).toBe("2.32.1");
  });
});
