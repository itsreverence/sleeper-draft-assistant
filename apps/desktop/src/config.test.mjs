import { describe, expect, it } from "vitest";

import config from "./config.cjs";

const { parseApiPort } = config;

describe("desktop API port configuration", () => {
  it("uses the default or a valid configured port", () => {
    expect(parseApiPort(undefined)).toBe(8787);
    expect(parseApiPort("18787")).toBe(18787);
  });

  it.each(["0", "65536", "1.5", "not-a-port"])("rejects invalid PORT=%s", (value) => {
    expect(() => parseApiPort(value)).toThrow(/PORT must be an integer/);
  });
});
