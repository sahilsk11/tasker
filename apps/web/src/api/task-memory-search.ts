import { apiClient } from "@/lib/api";
import type { TaskMemorySearchResponse } from "@tasker/core";

export type {
  TaskMemorySearchResponse,
  TaskMemorySearchResult
} from "@tasker/core";

export function searchTaskMemory(
  query: string,
  limit?: number
): Promise<TaskMemorySearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (limit !== undefined) {
    params.set("limit", String(limit));
  }
  return apiClient.get(`/search?${params.toString()}`);
}
