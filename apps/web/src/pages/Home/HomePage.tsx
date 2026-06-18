import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getLinearOptions,
  listLinearIssueStatuses,
  listTaskBundles,
  type LinearIssueStatus,
  type LinearOptions,
  type LinearTeamOption,
  type TaskBundle
} from "@/api/tasks";
import { NewTaskDialog } from "./NewTaskDialog";
import { SettingsDialog } from "./SettingsDialog";
import { TaskGrid, TaskGridSkeleton } from "./TaskGrid";
import { TaskToolbar } from "./TaskToolbar";
import {
  getVisibleTaskBundles,
  type TaskFilter,
  type TaskSort
} from "./task-filtering";
import { usePullRequestStatuses } from "./use-pull-request-statuses";

export function HomePage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [hasLinearSelectionChanged, setHasLinearSelectionChanged] = useState(false);
  const [linearStateIds, setLinearStateIds] = useState<readonly string[]>([]);
  const [linearTeamId, setLinearTeamId] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TaskSort>("updated-desc");
  const tasksQuery = useQuery({
    queryFn: listTaskBundles,
    queryKey: ["tasks"]
  });
  const ticketIdentifiers = useMemo(
    () => (tasksQuery.isSuccess ? getTicketIdentifiers(tasksQuery.data) : []),
    [tasksQuery.data, tasksQuery.isSuccess]
  );
  const linearOptionsQuery = useQuery({
    queryFn: getLinearOptions,
    queryKey: ["linear-options"]
  });
  const linearStatusesQuery = useQuery({
    enabled: ticketIdentifiers.length > 0,
    queryFn: () => listLinearIssueStatuses(ticketIdentifiers),
    queryKey: ["linear-issue-statuses", ticketIdentifiers]
  });
  const linearTeams = useMemo(
    () =>
      getLinearTeamsForTickets({
        identifiers: ticketIdentifiers,
        options: linearOptionsQuery.data ?? null,
        statuses: linearStatusesQuery.data ?? []
      }),
    [linearOptionsQuery.data, linearStatusesQuery.data, ticketIdentifiers]
  );
  const selectedLinearTeam =
    linearTeams.find((team) => team.id === linearTeamId) ?? linearTeams[0] ?? null;
  const selectedTeamStateIds = useMemo(
    () => selectedLinearTeam?.states.map((state) => state.id) ?? [],
    [selectedLinearTeam]
  );
  const visibleBundles = useMemo(
    () =>
      tasksQuery.isSuccess
        ? getVisibleTaskBundles(tasksQuery.data, {
            filter,
            linearAllStateIds: selectedTeamStateIds,
            linearIssueStatuses: linearStatusesQuery.data ?? [],
            linearStateIds,
            query,
            sort
          })
        : [],
    [
      filter,
      linearStateIds,
      linearStatusesQuery.data,
      query,
      sort,
      selectedTeamStateIds,
      tasksQuery.data,
      tasksQuery.isSuccess
    ]
  );
  const pullRequestStatuses = usePullRequestStatuses(visibleBundles);

  useEffect(() => {
    if (linearTeamId.length === 0 && linearTeams[0] != null) {
      setLinearTeamId(linearTeams[0].id);
    }
  }, [linearTeamId, linearTeams]);

  useEffect(() => {
    if (!hasLinearSelectionChanged && selectedTeamStateIds.length > 0) {
      setLinearStateIds(selectedTeamStateIds);
    }
  }, [hasLinearSelectionChanged, selectedTeamStateIds]);

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
            <SettingsDialog />
            <NewTaskDialog />
          </div>
        </header>

        {tasksQuery.isLoading ? <TaskGridSkeleton /> : null}
        {tasksQuery.isError ? <LoadError error={tasksQuery.error} /> : null}
        {tasksQuery.isSuccess ? (
          <>
            <TaskToolbar
              filter={filter}
              isFilterOpen={isFilterOpen}
              isLinearLoading={
                linearOptionsQuery.isLoading || linearStatusesQuery.isLoading
              }
              linearOptions={linearOptionsQuery.data ?? null}
              linearStateIds={linearStateIds}
              linearTeamId={linearTeamId}
              linearTeams={linearTeams}
              onFilterChange={setFilter}
              onFilterOpenChange={setIsFilterOpen}
              onLinearStateIdsChange={(stateIds) => {
                setHasLinearSelectionChanged(true);
                setLinearStateIds(stateIds);
              }}
              onLinearTeamChange={(teamId) => {
                setLinearTeamId(teamId);
                const team = linearTeams.find((candidate) => candidate.id === teamId);
                setLinearStateIds(team?.states.map((state) => state.id) ?? []);
                setHasLinearSelectionChanged(false);
              }}
              onQueryChange={setQuery}
              onSortChange={setSort}
              query={query}
              sort={sort}
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

function getTicketIdentifiers(bundles: readonly TaskBundle[]): readonly string[] {
  const identifiers = new Set<string>();
  for (const bundle of bundles) {
    for (const ticket of bundle.resources.tickets) {
      identifiers.add(ticket.externalId.toUpperCase());
    }
  }

  return Array.from(identifiers).sort();
}

function getLinearTeamsForTickets({
  identifiers,
  options,
  statuses
}: {
  readonly identifiers: readonly string[];
  readonly options: LinearOptions | null;
  readonly statuses: readonly LinearIssueStatus[];
}): readonly LinearTeamOption[] {
  if (options == null) {
    return [];
  }

  const statusTeamIds = new Set(statuses.map((issue) => issue.state.team.id));
  const ticketKeys = new Set(
    identifiers
      .map((identifier) => identifier.split("-")[0])
      .filter((key): key is string => key != null && key.length > 0)
  );

  return options.teams.filter(
    (team) => statusTeamIds.has(team.id) || ticketKeys.has(team.key)
  );
}

function LoadError({ error }: { readonly error: unknown }): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[76rem] rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error instanceof Error ? error.message : "Failed to load tasks."}
    </div>
  );
}
