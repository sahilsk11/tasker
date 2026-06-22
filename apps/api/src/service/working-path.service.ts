import type {
  UpdateWorkingPathSettingsInput,
  WorkingPathSettings
} from "../domain/working-paths.js";
import type { WorkingPathRepository } from "../repository/working-path.repository.js";
import { BadRequestError } from "./errors.js";
import { normalizeOptionalDirectoryPath } from "./working-directory.js";

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
    const currentSettings = await this.workingPaths.getSettings();
    const nextPublicAppBaseUrl =
      input.publicAppBaseUrl === undefined
        ? currentSettings.publicAppBaseUrl
        : normalizePublicAppBaseUrl(input.publicAppBaseUrl);
    const nextGeneratedUrlMode =
      input.generatedUrlMode ?? currentSettings.generatedUrlMode;

    if (nextGeneratedUrlMode === "public" && nextPublicAppBaseUrl == null) {
      throw new BadRequestError("Public app URL is required for public generated URLs");
    }

    return this.workingPaths.updateSettings({
      ...(input.defaultWorkingDirectory !== undefined
        ? {
            defaultWorkingDirectory: await normalizeOptionalDirectoryPath(
              input.defaultWorkingDirectory,
              "Default working directory"
            )
          }
        : {}),
      ...(input.defaultWorktreePath !== undefined
        ? { defaultWorktreePath: requireText(input.defaultWorktreePath, "Default worktree path") }
        : {}),
      ...(input.generatedUrlMode !== undefined
        ? { generatedUrlMode: input.generatedUrlMode }
        : {}),
      ...(input.publicAppBaseUrl !== undefined
        ? { publicAppBaseUrl: nextPublicAppBaseUrl }
        : {})
    });
  }
}

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestError(`${label} is required`);
  }

  return trimmed;
}

function normalizePublicAppBaseUrl(value: string | null): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestError("Public app URL must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BadRequestError("Public app URL must use http or https");
  }

  if (url.search.length > 0 || url.hash.length > 0) {
    throw new BadRequestError("Public app URL must not include a query or fragment");
  }

  const pathname = trimTrailingSlash(url.pathname);
  const appPath = pathname === "/api" ? "" : pathname.replace(/\/api$/u, "");
  return `${url.origin}${appPath === "/" ? "" : appPath}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/u, "");
}
