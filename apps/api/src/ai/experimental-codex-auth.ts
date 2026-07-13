import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readPrivateTextFile, removePrivateFile, writePrivateFile } from "../secure-file";

export type ExperimentalCodexTokenSet = {
  accessToken: string;
  refreshToken: string;
};

export type ExperimentalCodexDeviceCode = {
  userCode: string;
  deviceAuthId: string;
  verificationUri: string;
  interval: number;
};

export type ExperimentalCodexAuthStatus = {
  authenticated: boolean;
  verificationUri?: string;
  userCode?: string;
  deviceAuthId?: string;
  interval?: number;
};

export class ExperimentalCodexTokenStore {
  constructor(private readonly filePath = getDefaultTokenPath()) {}

  get(): ExperimentalCodexTokenSet | null {
    if (!existsSync(this.filePath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(readPrivateTextFile(this.filePath)) as Partial<ExperimentalCodexTokenSet>;
      if (!parsed.accessToken || !parsed.refreshToken) {
        return null;
      }
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
      };
    } catch {
      return null;
    }
  }

  set(tokens: ExperimentalCodexTokenSet) {
    writePrivateFile(this.filePath, `${JSON.stringify(tokens, null, 2)}\n`);
  }

  clear() {
    removePrivateFile(this.filePath);
  }
}

export class ExperimentalCodexAuthClient {
  private readonly clientId = "app_EMoamEEZ73f0CkXaXp7hrann";
  private readonly tokenUrl = "https://auth.openai.com/oauth/token";
  private readonly redirectUri = "https://auth.openai.com/deviceauth/callback";
  private readonly userCodeUrl = "https://auth.openai.com/api/accounts/deviceauth/usercode";
  private readonly deviceTokenUrl = "https://auth.openai.com/api/accounts/deviceauth/token";
  private readonly verificationUri = "https://auth.openai.com/codex/device";

  async requestDeviceCode(): Promise<ExperimentalCodexDeviceCode> {
    const response = await fetch(this.userCodeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.clientId }),
    });
    if (!response.ok) {
      throw new Error(`Codex device-code request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const userCode = stringFrom(payload.user_code);
    const deviceAuthId = stringFrom(payload.device_auth_id);
    if (!userCode || !deviceAuthId) {
      throw new Error("Codex device-code response missing required fields.");
    }

    return {
      userCode,
      deviceAuthId,
      verificationUri: this.verificationUri,
      interval: positiveInt(payload.interval, 5),
    };
  }

  async pollDeviceCode(deviceAuthId: string, userCode: string): Promise<ExperimentalCodexTokenSet | null> {
    const response = await fetch(this.deviceTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
    });
    if (response.status === 403 || response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Codex device-code polling failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const authorizationCode = stringFrom(payload.authorization_code);
    const codeVerifier = stringFrom(payload.code_verifier);
    if (!authorizationCode || !codeVerifier) {
      throw new Error("Codex device auth response missing exchange fields.");
    }

    return await this.exchangeAuthorizationCode(authorizationCode, codeVerifier);
  }

  async refresh(tokens: ExperimentalCodexTokenSet): Promise<ExperimentalCodexTokenSet> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: this.clientId,
    });
    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      throw new Error(`Codex token refresh failed with status ${response.status}.`);
    }

    return tokenSetFromPayload((await response.json()) as Record<string, unknown>, tokens.refreshToken);
  }

  private async exchangeAuthorizationCode(authorizationCode: string, codeVerifier: string): Promise<ExperimentalCodexTokenSet> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      code_verifier: codeVerifier,
    });
    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      throw new Error(`Codex token exchange failed with status ${response.status}.`);
    }

    return tokenSetFromPayload((await response.json()) as Record<string, unknown>);
  }
}

function tokenSetFromPayload(payload: Record<string, unknown>, fallbackRefresh = ""): ExperimentalCodexTokenSet {
  const accessToken = stringFrom(payload.access_token);
  const refreshToken = stringFrom(payload.refresh_token) || fallbackRefresh;
  if (!accessToken || !refreshToken) {
    throw new Error("Codex token response missing required fields.");
  }
  return { accessToken, refreshToken };
}

function stringFrom(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function getDefaultTokenPath(): string {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  return process.env.SLEEPER_AI_DATA_DIR
    ? path.join(process.env.SLEEPER_AI_DATA_DIR, "experimental-codex-tokens.json")
    : path.join(repoRoot, "data", "experimental-codex-tokens.json");
}