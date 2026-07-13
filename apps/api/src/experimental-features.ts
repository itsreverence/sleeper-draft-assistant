export const EXPERIMENTAL_CODEX_BACKEND_ENV = "SLEEPER_AI_ENABLE_EXPERIMENTAL_CODEX_BACKEND";

export function isExperimentalCodexBackendEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[EXPERIMENTAL_CODEX_BACKEND_ENV]?.trim() === "1";
}
