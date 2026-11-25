import type {
  TaskMemorySearchIndexStatus,
  TaskMemorySearchSourceType
} from "@tasker/core";

export type {
  TaskMemorySearchIndexStatus,
  TaskMemorySearchResponse,
  TaskMemorySearchResult,
  TaskMemorySearchSourceType
} from "@tasker/core";

export type TaskMemorySearchInput = {
  readonly limit: number;
  readonly query: string;
};

export type TaskMemorySearchJob = {
  readonly attempts: number;
  readonly entityId: string;
  readonly entityType: "message" | "session" | "task";
  readonly generationToken: string;
  readonly key: string;
  readonly leaseToken: string;
  readonly nextChunk: number;
  readonly taskId: string;
};

export type TaskMemoryIndexSource =
  | {
      readonly sessionId: string;
      readonly sessionTitle: string | null;
      readonly taskId: string;
      readonly taskTitle: string;
      readonly type: "session_title";
    }
  | {
      readonly messageId: string;
      readonly ordinal: number;
      readonly role: string;
      readonly sessionId: string;
      readonly sessionTitle: string | null;
      readonly taskId: string;
      readonly taskTitle: string;
      readonly text: string;
      readonly type: "message";
    }
  | {
      readonly taskId: string;
      readonly taskTitle: string;
      readonly type: "task_title";
    };

export type TaskMemoryIndexDocument = {
  readonly body: string;
  readonly embeddingText: string;
  readonly messageId: string | null;
  readonly messageOrdinal: number | null;
  readonly messageRole: string | null;
  readonly sessionId: string | null;
  readonly sourceType: TaskMemorySearchSourceType;
  readonly taskId: string;
  readonly title: string;
  readonly vectorId: string;
};

export type TaskMemorySearchCandidate = {
  readonly body: string;
  readonly messageId: string | null;
  readonly messageOrdinal: number | null;
  readonly messageRole: string | null;
  readonly parentTaskId: string | null;
  readonly semanticSimilarity: number | null;
  readonly sessionId: string | null;
  readonly sessionSourceUrl: string | null;
  readonly sessionTitle: string | null;
  readonly sourceType: TaskMemorySearchSourceType;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly title: string;
  readonly vectorId: string;
};

export type TaskMemoryMaybePromise<T> = T | Promise<T>;

export type TaskMemorySearchRepository = {
  readonly claimJobs: (
    limit: number
  ) => TaskMemoryMaybePromise<readonly TaskMemorySearchJob[]>;
  readonly completeJob: (
    job: TaskMemorySearchJob,
    nextChunk: number | null
  ) => TaskMemoryMaybePromise<void>;
  readonly deleteSource: (job: TaskMemorySearchJob) => TaskMemoryMaybePromise<boolean>;
  readonly failJob: (
    job: TaskMemorySearchJob,
    retryAt: string
  ) => TaskMemoryMaybePromise<void>;
  readonly getIndexStatus: () => TaskMemoryMaybePromise<TaskMemorySearchIndexStatus>;
  readonly getSource: (
    job: TaskMemorySearchJob
  ) => TaskMemoryMaybePromise<TaskMemoryIndexSource | null>;
  readonly lexicalSearch: (
    expression: string,
    limit: number
  ) => TaskMemoryMaybePromise<readonly TaskMemorySearchCandidate[]>;
  readonly persistDocuments: (
    job: TaskMemorySearchJob,
    documents: readonly TaskMemoryIndexDocument[],
    embeddings: readonly Float32Array[]
  ) => TaskMemoryMaybePromise<boolean>;
  readonly vectorSearch: (
    embedding: Float32Array,
    limit: number
  ) => TaskMemoryMaybePromise<readonly TaskMemorySearchCandidate[]>;
};

export type TaskMemoryEmbeddingProvider = {
  readonly model: string;
  readonly embed: (texts: readonly string[]) => Promise<readonly Float32Array[]>;
};
