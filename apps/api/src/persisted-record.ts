export type PersistedRecordErrorCode = "corrupt" | "unsupported-version";

export class PersistedRecordError extends Error {
  constructor(
    readonly code: PersistedRecordErrorCode,
    readonly domain: string,
  ) {
    super(
      code === "unsupported-version"
        ? `Stored ${domain} data uses an unsupported version. Clear or reset this local data before continuing.`
        : `Stored ${domain} data is incompatible. Clear or reset this local data before continuing.`,
    );
    this.name = "PersistedRecordError";
  }
}

export function persistedRecordError(error: unknown, domain: string): PersistedRecordError {
  return error instanceof PersistedRecordError ? error : new PersistedRecordError("corrupt", domain);
}

export type PersistedRecordCodec<T> = {
  readonly domain: string;
  readonly version: number;
  encode(data: T): { version: number; data: T };
  decode(value: unknown): { data: T; migrated: boolean };
};

export function createPersistedRecordCodec<T>(input: {
  domain: string;
  version: number;
  decodeData(value: unknown): T;
  decodeLegacy?(value: unknown): T;
}): PersistedRecordCodec<T> {
  return {
    domain: input.domain,
    version: input.version,
    encode(data) {
      return { version: input.version, data: decodeSafely(input, data) };
    },
    decode(value) {
      if (hasOwnVersion(value)) {
        if (value.version !== input.version) {
          throw new PersistedRecordError("unsupported-version", input.domain);
        }
        if (!("data" in value)) {
          throw new PersistedRecordError("corrupt", input.domain);
        }
        return { data: decodeSafely(input, value.data), migrated: false };
      }
      return {
        data: decodeSafely(
          { domain: input.domain, decodeData: input.decodeLegacy ?? input.decodeData },
          value,
        ),
        migrated: true,
      };
    },
  };
}

function hasOwnVersion(value: unknown): value is Record<string, unknown> & { version: unknown } {
  return typeof value === "object" && value !== null && Object.prototype.hasOwnProperty.call(value, "version");
}

function decodeSafely<T>(
  input: { domain: string; decodeData(value: unknown): T },
  value: unknown,
): T {
  try {
    return input.decodeData(value);
  } catch {
    throw new PersistedRecordError("corrupt", input.domain);
  }
}
