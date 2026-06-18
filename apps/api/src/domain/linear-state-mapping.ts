import type { TaskState } from "./task.js";

export type LinearTeamId = string;
export type LinearStateId = string;

export type LinearStateMapping = {
  readonly createdAt: Date;
  readonly linearStateId: LinearStateId;
  readonly taskState: TaskState;
  readonly teamId: LinearTeamId;
  readonly updatedAt: Date;
};

export type UpdateLinearStateMappingsInput = {
  readonly teamId: LinearTeamId;
  readonly mappings: ReadonlyMap<TaskState, LinearStateId | null>;
};
