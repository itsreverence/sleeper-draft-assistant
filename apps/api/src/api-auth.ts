import { timingSafeEqual } from "node:crypto";

import type { MiddlewareHandler } from "hono";

export const API_TOKEN_ENV = "SLEEPER_AI_API_TOKEN";

export function requireApiToken(token: string | null, options: { allowUnauthenticated?: boolean } = {}): MiddlewareHandler {
  if (!token && !options.allowUnauthenticated) {
    throw new Error(`${API_TOKEN_ENV} is required outside the test environment.`);
  }

  return async (c, next) => {
    if (options.allowUnauthenticated || c.req.method === "OPTIONS" || c.req.path === "/health") {
      await next();
      return;
    }

    const authorization = c.req.header("Authorization");
    const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
    const eventToken = c.req.path.endsWith("/events") ? c.req.query("apiToken") ?? null : null;

    if (!token || (!tokensMatch(token, bearerToken) && !tokensMatch(token, eventToken))) {
      return c.json({ error: "Local API authentication required." }, 401);
    }

    await next();
  };
}

function tokensMatch(expected: string, candidate: string | null): boolean {
  if (!candidate) {
    return false;
  }

  const expectedBytes = Buffer.from(expected);
  const candidateBytes = Buffer.from(candidate);
  return expectedBytes.length === candidateBytes.length && timingSafeEqual(expectedBytes, candidateBytes);
}
