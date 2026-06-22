export type GeneratedUrlMode = "localhost" | "public";

export type WorkingPathSettings = {
  readonly defaultWorkingDirectory: string | null;
  readonly defaultWorktreePath: string;
  readonly generatedUrlMode: GeneratedUrlMode;
  readonly publicAppBaseUrl: string | null;
  readonly updatedAt: Date;
};

export type UpdateWorkingPathSettingsInput = {
  readonly defaultWorkingDirectory?: string | null;
  readonly defaultWorktreePath?: string;
  readonly generatedUrlMode?: GeneratedUrlMode;
  readonly publicAppBaseUrl?: string | null;
};
