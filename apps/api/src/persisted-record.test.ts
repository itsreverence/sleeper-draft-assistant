import { describe, expect, it } from "vitest";

import { PersistedRecordError, createPersistedRecordCodec } from "./persisted-record";

const codec = createPersistedRecordCodec({
  domain: "test records",
  version: 1,
  decodeData(value: unknown) {
    if (typeof value !== "object" || value === null || typeof (value as { name?: unknown }).name !== "string") {
      throw new Error("invalid test record");
    }
    return { name: (value as { name: string }).name };
  },
});

describe("persisted record codecs", () => {
  it("encodes and decodes the current record version", () => {
    const encoded = codec.encode({ name: "current" });

    expect(encoded).toEqual({ version: 1, data: { name: "current" } });
    expect(codec.decode(encoded)).toEqual({ data: { name: "current" }, migrated: false });
  });

  it("recognizes the supported unversioned alpha shape as a legacy record", () => {
    expect(codec.decode({ name: "legacy" })).toEqual({ data: { name: "legacy" }, migrated: true });
  });

  it("rejects unknown versions with controlled recovery guidance", () => {
    expect(captureError(() => codec.decode({ version: 99, data: { name: "future" } }))).toMatchObject({
      code: "unsupported-version",
    });
    expect(() => codec.decode({ version: 99, data: { name: "future" } })).toThrow(
      "Stored test records data uses an unsupported version. Clear or reset this local data before continuing.",
    );
  });

  it("rejects corrupt values without exposing their contents", () => {
    const secret = "private-value-that-must-not-leak";

    expect(captureError(() => codec.decode({ version: 1, data: { name: 42, secret } }))).toMatchObject({
      code: "corrupt",
    });
    try {
      codec.decode({ version: 1, data: { name: 42, secret } });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});

function captureError(operation: () => unknown): PersistedRecordError {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(PersistedRecordError);
    return error as PersistedRecordError;
  }
  throw new Error("Expected operation to throw");
}
