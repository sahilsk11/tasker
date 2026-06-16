import { useQuery } from "@tanstack/react-query";
import {
  listPullRequestStatuses,
  type PullRequestStatusResult
} from "@/api/pull-requests";
import type { TaskBundle } from "@/api/tasks";
import { getPullRequestsForBundle } from "./task-resource-groups";

export type PullRequestStatusMap = ReadonlyMap<string, PullRequestStatusResult>;

export function usePullRequestStatuses(
  bundles: readonly TaskBundle[]
): PullRequestStatusMap {
  const urls = getPullRequestUrls(bundles);
  const statusesQuery = useQuery({
    enabled: urls.length > 0,
    queryFn: () => listPullRequestStatuses(urls),
    queryKey: ["pull-request-statuses", urls]
  });

  return new Map(statusesQuery.data?.map((status) => [status.url, status]) ?? []);
}

function getPullRequestUrls(bundles: readonly TaskBundle[]): readonly string[] {
  const urls = new Set<string>();
  for (const bundle of bundles) {
    for (const pullRequest of getPullRequestsForBundle(bundle)) {
      urls.add(pullRequest.url);
    }
  }

  return Array.from(urls).sort();
}
