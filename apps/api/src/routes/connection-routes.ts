import { Hono } from "hono";

import { getSleeperConnectOptions } from "../sleeper-connect";
import type { SleeperClient } from "../sleeper";
import type { RouteErrorHandler } from "./types";

type ConnectionRouteDependencies = {
  sleeperClient: SleeperClient;
  handleRouteError: RouteErrorHandler;
};

export function registerConnectionRoutes(app: Hono, dependencies: ConnectionRouteDependencies): void {
  app.get("/sleeper/connect", async (c) => {
    const username = c.req.query("username")?.trim();
    const season = c.req.query("season")?.trim() || null;
    const leagueId = c.req.query("leagueId")?.trim() || null;

    if (!username) {
      return c.json({ error: "Sleeper username or user ID is required." }, 400);
    }

    try {
      return c.json(await getSleeperConnectOptions(dependencies.sleeperClient, username, season, leagueId));
    } catch (error) {
      return dependencies.handleRouteError(c, error);
    }
  });
}
