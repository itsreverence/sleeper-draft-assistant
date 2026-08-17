import type { AppSettings } from "@sleeper-draft-assistant/shared";

import type { SettingsStore } from "./settings-store";
import type { SqliteAppDatabase } from "./sqlite-app-database";

type ResetTargets = {
  clearers: Array<() => unknown>;
  settingsStore: Pick<SettingsStore, "reset">;
};

export class LocalDataResetCoordinator {
  private generation = 0;

  constructor(private readonly dependencies: {
    database: SqliteAppDatabase;
    getResetTargets: () => ResetTargets;
    restoreStores: () => void;
    closeActiveProvider: () => void;
  }) {}

  captureGeneration(): number {
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  commitIfCurrent(generation: number, persist: () => void): boolean {
    if (!this.isCurrent(generation)) return false;
    persist();
    return true;
  }

  reset(): AppSettings {
    this.generation += 1;
    this.dependencies.closeActiveProvider();
    const targets = this.dependencies.getResetTargets();
    let settings: AppSettings | null = null;

    try {
      this.dependencies.database.batch(() => {
        for (const clear of targets.clearers) clear();
        settings = targets.settingsStore.reset();
      });
    } catch (error) {
      this.dependencies.restoreStores();
      throw error;
    }

    if (!settings) throw new Error("Local data reset did not produce default settings.");
    return settings;
  }
}
