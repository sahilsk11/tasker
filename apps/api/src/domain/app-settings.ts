export type AppSettings = {
  readonly defaultWorkingDirectory: string | null;
};

export type UpdateAppSettingsInput = {
  readonly defaultWorkingDirectory?: string | null;
};
