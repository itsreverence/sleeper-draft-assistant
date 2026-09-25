import { CommittedFileWriteError } from "./secure-file";

/** Keep a file-backed cache aligned with the outcome of its synchronous save. */
export function mutatePersistedMap<K, V, T>(cache: Map<K, V>, operation: () => T): T {
  const before = new Map(cache);
  try {
    return operation();
  } catch (error) {
    if (!(error instanceof CommittedFileWriteError)) {
      cache.clear();
      for (const [key, value] of before) cache.set(key, value);
    }
    throw error;
  }
}
