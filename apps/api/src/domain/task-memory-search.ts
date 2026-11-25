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

export type TaskMemorySearchResponse = {
  readonly indexedDocuments: number;
  readonly mode: "hybrid" | "lexical";
  readonly pendingJobs: number;
  readonly results: readonly TaskMemorySearchResult[];
  readonly semanticStatus: "degraded" | "indexing" | "ready";
};

export type TaskMemorySearchJob = {
  readonly attempts: number;
  readonly entityId: string;
  readonly entityType: "message" | "session" | "task";
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
  readonly chunkIndex: number;
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

export type TaskMemorySearchIndexStatus = {
  readonly indexedDocuments: number;
  readonly pendingJobs: number;
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
  readonly deleteSource: (job: TaskMemorySearchJob) => TaskMemoryMaybePromise<void>;
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
    documents: readonly TaskMemoryIndexDocument[],
    embeddings: readonly Float32Array[]
  ) => TaskMemoryMaybePromise<void>;
  readonly vectorSearch: (
    embedding: Float32Array,
    limit: number
  ) => TaskMemoryMaybePromise<readonly TaskMemorySearchCandidate[]>;
};

export type TaskMemoryEmbeddingProvider = {
  readonly model: string;
  readonly embed: (texts: readonly string[]) => Promise<readonly Float32Array[]>;
};
