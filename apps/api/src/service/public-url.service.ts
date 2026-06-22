import type { WorkingPathRepository } from "../repository/working-path.repository.js";

export class PublicUrlService {
  private readonly localhostApiBaseUrl: string;

  public constructor(
    localhostApiBaseUrl: string,
    private readonly workingPaths: WorkingPathRepository
  ) {
    this.localhostApiBaseUrl = trimTrailingSlash(localhostApiBaseUrl);
  }

  public async getApiBaseUrl(): Promise<string> {
    const settings = await this.workingPaths.getSettings();
    if (settings.generatedUrlMode === "public" && settings.publicAppBaseUrl != null) {
      return `${trimTrailingSlash(settings.publicAppBaseUrl)}/api`;
    }

    return this.localhostApiBaseUrl;
  }

  public async getAppBaseUrl(): Promise<string> {
    return stripApiSuffix(await this.getApiBaseUrl());
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/u, "");
}

function stripApiSuffix(value: string): string {
  return trimTrailingSlash(value).replace(/\/api$/u, "");
}
