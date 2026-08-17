import type { Context } from "hono";

export type RouteErrorHandler = (context: Context, error: unknown) => Response;
