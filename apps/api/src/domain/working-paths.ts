export type WorkingPathSettings = {
  readonly defaultWorkingDirectory: string | null;
  readonly defaultWorktreePath: string;
  readonly updatedAt: Date;
};

export type UpdateWorkingPathSettingsInput = {
  readonly defaultWorkingDirectory?: string | null;
  readonly defaultWorktreePath?: string;
};

export type WorkingDirectoryOption = {
  readonly createdAt: Date;
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly sortOrder: number;
  readonly updatedAt: Date;
};

export type CreateWorkingDirectoryOptionInput = {
  readonly label: string;
  readonly path: string;
  readonly sortOrder?: number;
};

export type UpdateWorkingDirectoryOptionInput = {
  readonly label?: string;
  readonly path?: string;
  readonly sortOrder?: number;
};
