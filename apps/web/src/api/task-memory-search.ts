import { apiClient } from "@/lib/api";

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
  readonly sourceType: "message" | "session_title" | "task_title";
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

export function searchTaskMemory(
  query: string,
  limit = 12
): Promise<TaskMemorySearchResponse> {
  const params = new URLSearchParams({ limit: String(limit), q: query });
  return apiClient.get(`/search?${params.toString()}`);
}
