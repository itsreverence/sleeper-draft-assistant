import { describe, expect, it } from "vitest";

import { parseApiPort } from "./config";

describe("API port configuration", () => {
  it("uses the default or a valid configured port", () => {
    expect(parseApiPort(undefined)).toBe(8787);
    expect(parseApiPort("18788")).toBe(18788);
  });

  it.each(["0", "65536", "1.5", "not-a-port"])("rejects invalid PORT=%s", (value) => {
    expect(() => parseApiPort(value)).toThrow(/PORT must be an integer/);
  });
});
