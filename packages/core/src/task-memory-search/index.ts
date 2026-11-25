export type TaskMemorySearchSourceType = "message" | "session_title" | "task_title";

export type TaskMemorySearchResult = {
  readonly messageId: string | null;
  readonly messageOrdinal: number | null;
  readonly messageRole: string | null;
  readonly parentTaskId: string | null;
  readonly score: number;
  readonly sessionId: string | null;
  readonly sessionSourceUrl: string | null;
  readonly sessionTitle: string | null;
  readonly snippet: string;
  readonly sourceType: TaskMemorySearchSourceType;
  readonly taskId: string;
  readonly taskTitle: string;
};

export type TaskMemorySearchIndexStatus = {
  readonly failedJobs: number;
  readonly indexedDocuments: number;
  readonly pendingJobs: number;
};

export type TaskMemorySearchResponse = TaskMemorySearchIndexStatus & {
  readonly mode: "hybrid" | "lexical";
  readonly results: readonly TaskMemorySearchResult[];
  readonly semanticStatus: "degraded" | "indexing" | "ready";
};
