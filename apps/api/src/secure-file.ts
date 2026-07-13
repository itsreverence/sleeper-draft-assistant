import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export function ensurePrivateDirectory(directoryPath: string): void {
  assertNoSymlinkPath(directoryPath);
  mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  assertNoSymlinkPath(directoryPath);
  if (process.platform !== "win32") {
    chmodSync(directoryPath, 0o700);
  }
}

export function readPrivateFile(filePath: string): Buffer {
  assertNoSymlinkPath(filePath);
  return readFileSync(filePath);
}

export function readPrivateTextFile(filePath: string): string {
  return readPrivateFile(filePath).toString("utf8");
}

export function writePrivateFile(filePath: string, data: string | Buffer): void {
  const directoryPath = path.dirname(filePath);
  ensurePrivateDirectory(directoryPath);
  assertNoSymlinkPath(filePath);

  const temporaryPath = path.join(
    directoryPath,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
  let descriptor: number | null = null;

  try {
    descriptor = openSync(temporaryPath, flags, 0o600);
    writeFileSync(descriptor, data);
    if (process.platform !== "win32") {
      fchmodSync(descriptor, 0o600);
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;

    assertNoSymlinkPath(filePath);
    renameSync(temporaryPath, filePath);
    if (process.platform !== "win32") {
      chmodSync(filePath, 0o600);
    }
    fsyncDirectory(directoryPath);
  } finally {
    if (descriptor !== null) {
      closeSync(descriptor);
    }
    rmSync(temporaryPath, { force: true });
  }
}

export function removePrivateFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }
  assertNoSymlinkPath(filePath);
  rmSync(filePath);
  fsyncDirectory(path.dirname(filePath));
}

export function assertNoSymlinkPath(targetPath: string): void {
  const absolutePath = path.resolve(targetPath);
  const parsed = path.parse(absolutePath);
  let currentPath = parsed.root;

  for (const segment of absolutePath.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, segment);
    try {
      if (lstatSync(currentPath).isSymbolicLink()) {
        throw new Error(`Refusing symbolic-link path: ${currentPath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
}

function fsyncDirectory(directoryPath: string): void {
  if (process.platform === "win32") {
    return;
  }

  let descriptor: number | null = null;
  try {
    descriptor = openSync(directoryPath, constants.O_RDONLY);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== null) {
      closeSync(descriptor);
    }
  }
}
