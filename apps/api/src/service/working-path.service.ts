import type {
  UpdateWorkingPathSettingsInput,
  WorkingPathSettings
} from "../domain/working-paths.js";
import type { WorkingPathRepository } from "../repository/working-path.repository.js";
import { BadRequestError } from "./errors.js";

export type WorkingPathConfig = {
  readonly settings: WorkingPathSettings;
};

export class WorkingPathService {
  public constructor(private readonly workingPaths: WorkingPathRepository) {}

  public async getConfig(): Promise<WorkingPathConfig> {
    return { settings: await this.workingPaths.getSettings() };
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
