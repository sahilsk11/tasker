export type TaskId = string;

export type Task = {
  readonly createdAt: Date;
  readonly description: string | null;
  readonly id: TaskId;
  readonly parentTaskId: TaskId | null;
  readonly title: string;
  readonly updatedAt: Date;
  readonly workingDirectory: string | null;
};

export type TaskDependencySummary = {
  readonly id: TaskId;
  readonly title: string;
};

export type TaskWithDependencies = Task & {
  readonly dependencies: readonly TaskDependencySummary[];
};

export type CreateTaskInput = {
  readonly description: string | null;
  readonly parentTaskId: TaskId | null;
  readonly title: string;
  readonly workingDirectory?: string | null;
};

export type UpdateTaskInput = {
  readonly description?: string | null;
  readonly parentTaskId?: TaskId | null;
  readonly title?: string;
  readonly workingDirectory?: string | null;
};
