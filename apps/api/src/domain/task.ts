export type TaskId = string;

export type Task = {
  readonly createdAt: Date;
  readonly description: string | null;
  readonly id: TaskId;
  readonly parentTaskId: TaskId | null;
  readonly title: string;
  readonly updatedAt: Date;
};

export type CreateTaskInput = {
  readonly description: string | null;
  readonly parentTaskId: TaskId | null;
  readonly title: string;
};

export type UpdateTaskInput = {
  readonly description?: string | null;
  readonly parentTaskId?: TaskId | null;
  readonly title?: string;
};
