export function resolvePackagedApiPort(value: string | null): number {
  const requestedPort = Number(value ?? "8787");
  return Number.isInteger(requestedPort) && requestedPort >= 1 && requestedPort <= 65_535
    ? requestedPort
    : 8787;
}
