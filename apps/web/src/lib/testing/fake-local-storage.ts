type LocalStorageSnapshot = Record<string, string>;

export type FakeStorage = Storage & {
  snapshot(): LocalStorageSnapshot;
};

export function createFakeLocalStorage(initial: LocalStorageSnapshot = {}): FakeStorage {
  const entries = new Map(Object.entries(initial));

  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, String(value));
    },
    snapshot() {
      return Object.fromEntries(entries.entries());
    },
  };
}
