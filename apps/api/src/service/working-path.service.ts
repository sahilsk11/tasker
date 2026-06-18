import type {
  CreateWorkingDirectoryOptionInput,
  UpdateWorkingDirectoryOptionInput,
  UpdateWorkingPathSettingsInput,
  WorkingDirectoryOption,
  WorkingPathSettings
} from "../domain/working-paths.js";
import type { WorkingPathRepository } from "../repository/working-path.repository.js";
import { BadRequestError, ConflictError, NotFoundError } from "./errors.js";

export type WorkingPathConfig = {
  readonly options: readonly WorkingDirectoryOption[];
  readonly settings: WorkingPathSettings;
};

export class WorkingPathService {
  public constructor(private readonly workingPaths: WorkingPathRepository) {}

  public async createOption(
    input: CreateWorkingDirectoryOptionInput
  ): Promise<WorkingDirectoryOption> {
    return this.mapUniquePathConflict(() =>
      this.workingPaths.createOption({
        label: requireText(input.label, "Label"),
        path: requireText(input.path, "Path"),
        sortOrder: input.sortOrder ?? 0
      })
    );
  }

  public async deleteOption(id: string): Promise<void> {
    const deleted = await this.workingPaths.deleteOption(id);
    if (!deleted) {
      throw new NotFoundError(`Working directory option ${id} not found`);
    }
  }

  public async getConfig(): Promise<WorkingPathConfig> {
    const [settings, options] = await Promise.all([
      this.workingPaths.getSettings(),
      this.workingPaths.listOptions()
    ]);

    return { options, settings };
  }

  public async updateOption(
    id: string,
    input: UpdateWorkingDirectoryOptionInput
  ): Promise<WorkingDirectoryOption> {
    const option = await this.mapUniquePathConflict(() =>
      this.workingPaths.updateOption(id, {
        ...(input.label !== undefined
          ? { label: requireText(input.label, "Label") }
          : {}),
        ...(input.path !== undefined ? { path: requireText(input.path, "Path") } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {})
      })
    );

    if (option == null) {
      throw new NotFoundError(`Working directory option ${id} not found`);
    }

    return option;
  }

  public async updateSettings(
    input: UpdateWorkingPathSettingsInput
  ): Promise<WorkingPathSettings> {
    return this.workingPaths.updateSettings({
      ...(input.defaultWorkingDirectory !== undefined
        ? { defaultWorkingDirectory: optionalText(input.defaultWorkingDirectory) }
        : {}),
      ...(input.defaultWorktreePath !== undefined
        ? { defaultWorktreePath: requireText(input.defaultWorktreePath, "Default worktree path") }
        : {})
    });
  }

  private async mapUniquePathConflict<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isSqliteUniqueConstraint(error)) {
        throw new ConflictError("Working directory path already exists");
      }

      throw error;
    }
  }
}

function optionalText(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed == null || trimmed.length === 0 ? null : trimmed;
}

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestError(`${label} is required`);
  }

  return trimmed;
}

function isSqliteUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}
