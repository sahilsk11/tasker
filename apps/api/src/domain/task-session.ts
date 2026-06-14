import type { TaskId } from "./task.js";

export type TaskSessionId = string;

export type AgentProvider = "codex" | "cursor" | "opencode";

export type TaskSession = {
  readonly createdAt: Date;
  readonly id: TaskSessionId;
  readonly provider: AgentProvider;
  readonly taskId: TaskId;
};

export type CreateTaskSessionInput = {
  readonly provider: AgentProvider;
};
