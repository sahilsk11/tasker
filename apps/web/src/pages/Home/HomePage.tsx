import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  listTaskBundles,
  listTaskStates,
  type TaskState
} from "@/api/tasks";
import { NewTaskDialog } from "./NewTaskDialog";
import { SettingsDialog } from "./SettingsDialog";
import { TaskGrid, TaskGridSkeleton } from "./TaskGrid";
import { TaskToolbar } from "./TaskToolbar";
import { getVisibleTaskBundles, type TaskFilter } from "./task-filtering";
import { usePullRequestStatuses } from "./use-pull-request-statuses";

export function HomePage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const parentTaskId = searchParams.get("parentTask");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [hasTaskStateSelectionChanged, setHasTaskStateSelectionChanged] =
    useState(false);
  const [query, setQuery] = useState("");
  const [taskStates, setTaskStates] = useState<readonly TaskState[]>([]);
  const tasksQuery = useQuery({
    queryFn: () => listTaskBundles(parentTaskId),
    queryKey: ["tasks", parentTaskId]
  });
  const taskStatesQuery = useQuery({
    queryFn: listTaskStates,
    queryKey: ["task-states"]
  });
  const allTaskStates = useMemo(
    () => taskStatesQuery.data?.map((state) => state.value) ?? [],
    [taskStatesQuery.data]
  );
  const visibleBundles = useMemo(
    () =>
      tasksQuery.isSuccess
        ? getVisibleTaskBundles(tasksQuery.data, {
            filter,
            query,
            taskAllStates: allTaskStates,
            taskStates
          })
        : [],
    [
      allTaskStates,
      filter,
      query,
      taskStates,
      tasksQuery.data,
      tasksQuery.isSuccess
    ]
  );
  const pullRequestStatuses = usePullRequestStatuses(visibleBundles);

  useEffect(() => {
    if (!hasTaskStateSelectionChanged && allTaskStates.length > 0) {
      setTaskStates(allTaskStates);
    }
  }, [allTaskStates, hasTaskStateSelectionChanged]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 2xl:max-w-[96rem]">
        <header className="flex items-center justify-between gap-4 border-b border-border/70 pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-2xl font-extrabold tracking-[-0.01em] text-[#f4f5f7] sm:text-3xl">
              Tasker
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NewTaskDialog />
            <SettingsDialog />
          </div>
        </header>

        {tasksQuery.isLoading ? <TaskGridSkeleton /> : null}
        {tasksQuery.isError ? <LoadError error={tasksQuery.error} /> : null}
        {taskStatesQuery.isError ? <LoadError error={taskStatesQuery.error} /> : null}
        {tasksQuery.isSuccess ? (
          <>
            <TaskToolbar
              filter={filter}
              isFilterOpen={isFilterOpen}
              onFilterChange={setFilter}
              onFilterOpenChange={setIsFilterOpen}
              onTaskStatesChange={(states) => {
                setHasTaskStateSelectionChanged(true);
                setTaskStates(states);
              }}
              onQueryChange={setQuery}
              query={query}
              selectedTaskStates={taskStates}
              taskStates={taskStatesQuery.data ?? []}
            />
            <TaskGrid
              bundles={visibleBundles}
              onSessionRun={() => {
                void queryClient.invalidateQueries({ queryKey: ["tasks"] });
              }}
              pullRequestStatuses={pullRequestStatuses}
              taskStateDefinitions={taskStatesQuery.data ?? []}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}

function LoadError({ error }: { readonly error: unknown }): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[76rem] rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error instanceof Error ? error.message : "Failed to load tasks."}
    </div>
  );
}
