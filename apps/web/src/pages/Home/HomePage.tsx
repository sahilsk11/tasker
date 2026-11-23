import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import {
  getTask,
  listTaskBundles
} from "@/api/tasks";
import { NewTaskDialog } from "./NewTaskDialog";
import { SettingsDialog } from "./SettingsDialog";
import { TaskGrid, TaskGridSkeleton } from "./TaskGrid";
import { TaskToolbar } from "./TaskToolbar";
import { getVisibleTaskBundles, type TaskFilter } from "./task-filtering";
import { usePullRequestStatuses } from "./use-pull-request-statuses";

type TaskViewState = {
  readonly filter: TaskFilter;
  readonly query: string;
};

const rootTaskViewKey = "__root__";

const defaultTaskViewState: TaskViewState = {
  filter: "all",
  query: "",
};

export function HomePage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const parentTaskId = searchParams.get("parentTask");
  const taskViewKey = parentTaskId ?? rootTaskViewKey;
  const [taskViewStates, setTaskViewStates] = useState<
    Readonly<Record<string, TaskViewState>>
  >({});
  const taskViewState = taskViewStates[taskViewKey] ?? defaultTaskViewState;
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const tasksQuery = useQuery({
    queryFn: () => listTaskBundles(parentTaskId),
    queryKey: ["tasks", parentTaskId]
  });
  const parentTaskQuery = useQuery({
    enabled: parentTaskId != null,
    queryFn: () => getTask(parentTaskId ?? ""),
    queryKey: ["task", parentTaskId]
  });
  const visibleBundles = useMemo(
    () =>
      tasksQuery.isSuccess
        ? getVisibleTaskBundles(tasksQuery.data, {
            filter: taskViewState.filter,
            query: taskViewState.query,
          })
        : [],
    [
      taskViewState.filter,
      taskViewState.query,
      tasksQuery.data,
      tasksQuery.isSuccess
    ]
  );
  const pullRequestStatuses = usePullRequestStatuses(visibleBundles);

  const updateTaskViewState = useCallback(
    (update: (state: TaskViewState) => TaskViewState): void => {
      setTaskViewStates((current) => ({
        ...current,
        [taskViewKey]: update(current[taskViewKey] ?? defaultTaskViewState)
      }));
    },
    [taskViewKey]
  );

  useEffect(() => {
    setIsFilterOpen(false);
  }, [taskViewKey]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 2xl:max-w-[96rem]">
        <header className="flex items-center justify-between gap-4 border-b border-border/70 pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-2xl font-extrabold tracking-[-0.01em] text-[#f4f5f7] sm:text-3xl">
              {parentTaskId == null ? "Tasker" : <Link to="/">Tasker</Link>}
            </h1>
            {parentTaskQuery.data == null ? null : <span className="truncate text-sm text-muted-foreground">/ {parentTaskQuery.data.title}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NewTaskDialog
              parentTaskId={parentTaskId}
              parentTaskTitle={parentTaskQuery.data?.title ?? null}
            />
            <SettingsDialog />
          </div>
        </header>

        {tasksQuery.isLoading ? <TaskGridSkeleton /> : null}
        {tasksQuery.isError ? <LoadError error={tasksQuery.error} /> : null}
        {tasksQuery.isSuccess ? (
          <>
            <TaskToolbar
              filter={taskViewState.filter}
              isFilterOpen={isFilterOpen}
              onFilterChange={(filter) => {
                updateTaskViewState((state) => ({ ...state, filter }));
              }}
              onFilterOpenChange={setIsFilterOpen}
              onQueryChange={(query) => {
                updateTaskViewState((state) => ({ ...state, query }));
              }}
              query={taskViewState.query}
            />
            <TaskGrid
              bundles={visibleBundles}
              onSessionRun={() => {
                void queryClient.invalidateQueries({ queryKey: ["tasks"] });
              }}
              pullRequestStatuses={pullRequestStatuses}
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
