import type { QueryClient } from "@tanstack/react-query";
import {
  getWorkingPaths,
  type ApiWorkingPathSettings,
  type WorkingPathConfig
} from "@/api/tasks";

export const workingPathsQueryKey = ["working-paths"] as const;

export const workingPathsQueryOptions = {
  queryFn: getWorkingPaths,
  queryKey: workingPathsQueryKey
} as const;

export function setWorkingPathSettingsCache(
  queryClient: QueryClient,
  settings: ApiWorkingPathSettings
): void {
  queryClient.setQueryData<WorkingPathConfig>(workingPathsQueryKey, { settings });
}
