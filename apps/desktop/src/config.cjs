function parseApiPort(value, fallback = 8787) {
  const candidate = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received ${String(value)}.`);
  }
  return candidate;
}

module.exports = { parseApiPort };
