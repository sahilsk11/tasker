import { useQuery } from "@tanstack/react-query";
import {
  listPullRequestStatuses,
  type PullRequestStatusResult
} from "@/api/pull-requests";
import type { TaskBundle } from "@/api/tasks";

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
    for (const artifact of bundle.resources.artifacts) {
      if (isPullRequestArtifact(artifact.kind)) {
        urls.add(artifact.uri);
      }
    }
  }

  return Array.from(urls).sort();
}

function isPullRequestArtifact(kind: string): boolean {
  return ["pr", "pull_request", "pull-request"].includes(kind.toLowerCase());
}
