import { mkdir, realpath, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { TaskArtifact } from "../domain/task-artifact.js";
import type { TaskId } from "../domain/task.js";
import { BadRequestError } from "./errors.js";

export type ArtifactStorageOptions = {
  readonly activeRoot?: string;
  readonly archiveRoot?: string;
};

export class ArtifactStorageService {
  private readonly activeRoot: string;
  private readonly archiveRoot: string;

  public constructor(options: ArtifactStorageOptions = {}) {
    this.activeRoot = resolve(
      options.activeRoot ?? join(homedir(), ".tasker", "artifacts")
    );
    this.archiveRoot = resolve(
      options.archiveRoot ?? join(homedir(), ".tasker", "archive", "artifacts")
    );
  }

  public async archive(artifact: TaskArtifact): Promise<string> {
    const sourcePath = await this.requireManagedFilePath(artifact.uri, "active");
    const destinationPath = this.destinationPath(
      this.archiveRoot,
      artifact.taskId,
      artifact.id,
      sourcePath
    );
    await this.moveManagedFile(sourcePath, destinationPath);
    return destinationPath;
  }

  public async restore(artifact: TaskArtifact): Promise<string> {
    const sourcePath = await this.requireManagedFilePath(artifact.uri, "archive");
    const destinationPath = this.destinationPath(
      this.activeRoot,
      artifact.taskId,
      artifact.id,
      sourcePath
    );
    await this.moveManagedFile(sourcePath, destinationPath);
    return destinationPath;
  }

  public async delete(artifact: TaskArtifact): Promise<void> {
    const expectedRoot = artifact.archivedAt == null ? "active" : "archive";
    const filePath = await this.requireManagedFilePath(artifact.uri, expectedRoot);
    await rm(filePath);
  }

  private async moveManagedFile(
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    await mkdir(resolve(destinationPath, ".."), { recursive: true });
    await rename(sourcePath, destinationPath);
  }

  private destinationPath(
    root: string,
    taskId: TaskId,
    artifactId: string,
    sourcePath: string
  ): string {
    const destination = resolve(root, taskId, artifactId, basename(sourcePath));
    if (!isPathInside(destination, root)) {
      throw new BadRequestError("Artifact destination escaped managed storage");
    }
    return destination;
  }

  private async requireManagedFilePath(
    uri: string,
    expectedRoot: "active" | "archive"
  ): Promise<string> {
    const filePath = resolveLocalArtifactUri(uri);
    const root = expectedRoot === "active" ? this.activeRoot : this.archiveRoot;
    const [realFilePath, realRoot] = await Promise.all([
      realpath(filePath),
      realpath(root).catch(async (error: unknown) => {
        if (isNodeError(error) && error.code === "ENOENT") {
          await mkdir(root, { recursive: true });
          return realpath(root);
        }
        throw error;
      })
    ]);

    if (!isPathInside(realFilePath, realRoot)) {
      throw new BadRequestError("Artifact path is outside managed storage");
    }

    return realFilePath;
  }
}

function resolveLocalArtifactUri(uri: string): string {
  if (uri.startsWith("file://")) {
    return fileURLToPath(uri);
  }

  if (isAbsolute(uri)) {
    return uri;
  }

  throw new BadRequestError("Artifact lifecycle operations require local file paths");
}

function isPathInside(path: string, root: string): boolean {
  const relativePath = relative(root, path);
  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !relativePath.startsWith(sep))
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
