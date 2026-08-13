const packagedApiSessionKey = "sleeper-draft-assistant:packaged-api";

export type PackagedApiConfiguration = {
  apiToken: string | null;
  apiPort: number;
};

export function resolvePackagedApiPort(value: string | null): number {
  const requestedPort = Number(value ?? "8787");
  return Number.isInteger(requestedPort) && requestedPort >= 1 && requestedPort <= 65_535
    ? requestedPort
    : 8787;
}

export function resolvePackagedApiConfiguration(
  parameters: URLSearchParams,
  sessionStorage: Pick<Storage, "getItem" | "setItem"> | null,
): PackagedApiConfiguration {
  const launchToken = parameters.get("apiToken")?.trim() || null;
  if (launchToken) {
    const configuration = {
      apiToken: launchToken,
      apiPort: resolvePackagedApiPort(parameters.get("apiPort")),
    };

    try {
      sessionStorage?.setItem(packagedApiSessionKey, JSON.stringify(configuration));
    } catch {
      // The launch query remains sufficient when renderer session storage is unavailable.
    }

    return configuration;
  }

  try {
    const storedValue = sessionStorage?.getItem(packagedApiSessionKey);
    if (storedValue) {
      const stored = JSON.parse(storedValue) as Partial<PackagedApiConfiguration>;
      const storedToken = typeof stored.apiToken === "string" ? stored.apiToken.trim() : "";
      if (storedToken) {
        return {
          apiToken: storedToken,
          apiPort: resolvePackagedApiPort(String(stored.apiPort ?? "")),
        };
      }
    }
  } catch {
    // A missing or malformed session value falls back to the normal packaged defaults.
  }

  return { apiToken: null, apiPort: 8787 };
}
