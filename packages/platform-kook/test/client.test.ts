import { describe, expect, it } from "vitest";

import { encodeKookHeartbeat } from "../src/index.js";

describe("KOOK official Gateway protocol", () => {
  it("encodes PING with the last sequence number at the top level", () => {
    expect(JSON.parse(encodeKookHeartbeat(42))).toEqual({ s: 2, sn: 42 });
  });
});
