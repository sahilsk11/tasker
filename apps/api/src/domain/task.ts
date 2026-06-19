export type TaskId = string;

export const taskStateDefinitions = [
  { label: "Ready", rank: 0, value: "ready" },
  { label: "Scoping", rank: 1, value: "scoping" },
  { label: "Planning", rank: 2, value: "planning" },
  { label: "Implementation", rank: 3, value: "implementation" },
  { label: "Review", rank: 4, value: "review" },
  { label: "Done", rank: 5, value: "done" }
] as const;

export type TaskStateDefinition = (typeof taskStateDefinitions)[number];
export type TaskState = TaskStateDefinition["value"];

export const taskStates = taskStateDefinitions.map(
  (definition) => definition.value
) as [TaskState, ...TaskState[]];

export const taskStateRanks = Object.fromEntries(
  taskStateDefinitions.map((definition) => [definition.value, definition.rank])
) as Record<TaskState, number>;

export type Task = {
  readonly createdAt: Date;
  readonly description: string | null;
  readonly id: TaskId;
  readonly parentTaskId: TaskId | null;
  readonly state: TaskState;
  readonly title: string;
  readonly updatedAt: Date;
  readonly workingDirectory: string | null;
};

export type TaskDependencySummary = {
  readonly id: TaskId;
  readonly state: TaskState;
  readonly title: string;
};

export type TaskWithDependencyState = Task & {
  readonly waitingDependencies: readonly TaskDependencySummary[];
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
  readonly state?: TaskState;
  readonly title?: string;
  readonly workingDirectory?: string | null;
};
