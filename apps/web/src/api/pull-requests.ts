import { apiClient } from "@/lib/api";

export type PullRequestStatus = "closed" | "draft" | "merged" | "open" | "unknown";

export type PullRequestStatusResult = {
  readonly error: string | null;
  readonly number: number | null;
  readonly status: PullRequestStatus;
  readonly url: string;
};

export async function listPullRequestStatuses(
  urls: readonly string[]
): Promise<readonly PullRequestStatusResult[]> {
  const uniqueUrls = Array.from(new Set(urls));
  if (uniqueUrls.length === 0) {
    return [];
  }

  const { pullRequests } = await apiClient.post<{
    readonly pullRequests: readonly PullRequestStatusResult[];
  }>("/github/pull-requests/statuses", { urls: uniqueUrls });
  return pullRequests;
}
