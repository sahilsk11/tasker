export type WorkingPathSettings = {
  readonly defaultWorkingDirectory: string | null;
  readonly defaultWorktreePath: string;
  readonly updatedAt: Date;
};

export type UpdateWorkingPathSettingsInput = {
  readonly defaultWorkingDirectory?: string | null;
  readonly defaultWorktreePath?: string;
};
