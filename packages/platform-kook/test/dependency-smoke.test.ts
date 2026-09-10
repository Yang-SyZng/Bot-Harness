import { describe, expect, it } from "vitest";

// @ts-expect-error @gedaxin/kook exports this runtime subpath but omits its declaration mapping.
import { Client } from "@gedaxin/kook/src/client/Client.js";

describe("KOOK integration package loading", () => {
  it("loads the published client subpath without the broken package root", () => {
    expect(typeof Client).toBe("function");
  });
});
