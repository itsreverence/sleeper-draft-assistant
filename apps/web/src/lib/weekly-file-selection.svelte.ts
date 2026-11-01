import { inferFantasyProsProjectionPosition } from "./fantasypros-projection-file";
import { positionLabel } from "./team-attention";
import type { Position } from "./types";

export type SelectedProjectionFile = { name: string; position: Position; csvText: string };

export function isFlexFilename(filename: string) {
  return /(?:^|[_\s-])(?:FLEX|FLX)(?=[_.\s(-]|$)/i.test(filename);
}

export function importLabel(files: SelectedProjectionFile[], position: Position) {
  return files.length > 1 ? `Import ${files.length} files` : `Import ${positionLabel(files[0]?.position ?? position)}`;
}

export class WeeklyFileSelection {
  files: SelectedProjectionFile[] = $state([]);
  ignored: string[] = $state([]);
  unknown: string[] = $state([]);
  #version = 0;

  clear() {
    this.#version++;
    this.files = [];
    this.ignored = [];
    this.unknown = [];
  }

  // A lone file with an unrecognized name takes fallbackPosition. With no fallback it's reported as unknown rather than guessed.
  async read(files: File[], fallbackPosition: Position | null): Promise<boolean> {
    this.clear();
    const version = this.#version;
    try {
      const parsed = await Promise.all(files.map(async (file) => {
        const csvText = await file.text();
        return { name: file.name, position: inferFantasyProsProjectionPosition({ name: file.name, csv: csvText }), csvText };
      }));
      if (version !== this.#version) return true;
      const lone = files.length === 1 ? fallbackPosition : null;
      this.ignored = parsed.filter((file) => isFlexFilename(file.name)).map((file) => file.name);
      this.unknown = lone ? [] : parsed.filter((file) => !file.position && !isFlexFilename(file.name)).map((file) => file.name);
      const byPosition = new Map<Position, SelectedProjectionFile>();
      for (const file of parsed) {
        if (isFlexFilename(file.name)) continue;
        const position = file.position ?? lone;
        if (position) byPosition.set(position, { ...file, position });
      }
      this.files = Array.from(byPosition.values());
      return true;
    } catch {
      return version !== this.#version;
    }
  }
}
