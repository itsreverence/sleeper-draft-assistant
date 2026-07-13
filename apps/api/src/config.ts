export function parseApiPort(value: string | undefined, fallback = 8787): number {
  const candidate = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received ${String(value)}.`);
  }
  return candidate;
}
