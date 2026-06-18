import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getLinearOptions,
  getLinearStateMappings,
  listTaskStates,
  saveLinearStateMappings,
  type LinearStateMappingInput,
  type LinearTeamOption,
  type TaskStateDefinition,
  type TaskState
} from "@/api/tasks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { isApiError } from "@/lib/api";

const DO_NOT_SYNC_VALUE = "";
const EMPTY_TASK_STATES: readonly TaskStateDefinition[] = [];
const EMPTY_LINEAR_TEAMS: readonly LinearTeamOption[] = [];

export function LinearStateMappingSettings(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [draftMappings, setDraftMappings] =
    useState<LinearStateMappingInput | null>(null);

  const linearOptionsQuery = useQuery({
    queryFn: getLinearOptions,
    queryKey: ["linear-options"]
  });
  const taskStatesQuery = useQuery({
    queryFn: listTaskStates,
    queryKey: ["task-states"]
  });
  const mappingsQuery = useQuery({
    enabled: linearOptionsQuery.data?.configured === true,
    queryFn: getLinearStateMappings,
    queryKey: ["linear-state-mappings"]
  });

  const linearOptions = linearOptionsQuery.data ?? null;
  const taskStates = taskStatesQuery.data ?? EMPTY_TASK_STATES;
  const linearTeams = linearOptions?.teams ?? EMPTY_LINEAR_TEAMS;
  const selectedTeam = useMemo(
    () => getSelectedTeam(linearTeams, selectedTeamId),
    [linearTeams, selectedTeamId]
  );
  const errorMessage =
    getErrorMessage(linearOptionsQuery.error) ??
    getErrorMessage(taskStatesQuery.error) ??
    getErrorMessage(mappingsQuery.error);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (selectedTeam == null || draftMappings == null) {
        throw new Error("Select a Linear team.");
      }

      return saveLinearStateMappings(
        selectedTeam.id,
        buildMappingsInput(taskStates.map((state) => state.value), draftMappings)
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["linear-state-mappings"] });
    }
  });

  useEffect(() => {
    if (linearOptions?.configured !== true) {
      setSelectedTeamId("");
      return;
    }

    if (selectedTeamId.length > 0 && getSelectedTeam(linearOptions.teams, selectedTeamId)) {
      return;
    }

    setSelectedTeamId(linearOptions.teams.at(0)?.id ?? "");
  }, [linearOptions, selectedTeamId]);

  useEffect(() => {
    if (selectedTeam == null || taskStates.length === 0) {
      setDraftMappings(null);
      return;
    }

    setDraftMappings(
      buildDraftMappings({
        mappings: mappingsQuery.data ?? [],
        taskStates: taskStates.map((state) => state.value),
        teamId: selectedTeam.id
      })
    );
  }, [mappingsQuery.data, selectedTeam, taskStates]);

  if (linearOptionsQuery.isLoading || taskStatesQuery.isLoading) {
    return (
      <section className="flex min-h-72 items-center gap-2 p-5 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        <span>Loading Linear settings...</span>
      </section>
    );
  }

  if (linearOptions?.configured === false) {
    return (
      <section className="grid min-h-72 content-start gap-2 p-5">
        <h3 className="text-base font-semibold leading-6">Linear</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          LINEAR_API_KEY is not configured.
        </p>
      </section>
    );
  }

  return (
    <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/20 px-5 py-4">
        <div className="grid min-w-0 gap-1">
          <h3 className="text-base font-semibold leading-6">Linear</h3>
          <p className="text-sm text-muted-foreground">
            Map Tasker states to Linear workflow states.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={selectedTeam == null || draftMappings == null || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          <span>Save</span>
        </Button>
      </div>
      <div className="min-h-0 overflow-y-auto p-5">
        {errorMessage == null ? null : (
          <p className="mb-4 text-sm text-destructive">{errorMessage}</p>
        )}
        {saveMutation.error == null ? null : (
          <p className="mb-4 text-sm text-destructive">
            {getErrorMessage(saveMutation.error)}
          </p>
        )}
        <div className="grid max-w-3xl gap-5">
          <div className="grid gap-2">
            <Label htmlFor="linear-team">Team</Label>
            <NativeSelect
              id="linear-team"
              value={selectedTeamId}
              onChange={(event) => setSelectedTeamId(event.target.value)}
              disabled={linearOptions?.teams.length === 0}
            >
              {(linearOptions?.teams ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.key})
                </option>
              ))}
            </NativeSelect>
          </div>
          {selectedTeam == null ? (
            <p className="text-sm text-muted-foreground">No Linear teams available.</p>
          ) : mappingsQuery.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              <span>Loading mappings...</span>
            </p>
          ) : (
            <div className="grid gap-3">
              {taskStates.map((taskState) => (
                <div
                  key={taskState.value}
                  className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center"
                >
                  <Label htmlFor={`linear-state-${taskState.value}`}>
                    {taskState.label}
                  </Label>
                  <NativeSelect
                    id={`linear-state-${taskState.value}`}
                    value={draftMappings?.[taskState.value] ?? DO_NOT_SYNC_VALUE}
                    onChange={(event) =>
                      setDraftMappings((currentMappings) =>
                        updateDraftMapping(
                          currentMappings,
                          taskState.value,
                          event.target.value
                        )
                      )
                    }
                  >
                    <option value={DO_NOT_SYNC_VALUE}>Do not sync</option>
                    {selectedTeam.states.map((state) => (
                      <option key={state.id} value={state.id}>
                        {state.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function getSelectedTeam(
  teams: readonly LinearTeamOption[],
  teamId: string
): LinearTeamOption | null {
  if (teamId.length === 0) {
    return null;
  }

  return teams.find((team) => team.id === teamId) ?? null;
}

function buildDraftMappings({
  mappings,
  taskStates,
  teamId
}: {
  readonly mappings: ReadonlyArray<{
    readonly linearStateId: string;
    readonly taskState: TaskState;
    readonly teamId: string;
  }>;
  readonly taskStates: readonly TaskState[];
  readonly teamId: string;
}): LinearStateMappingInput {
  const savedMappings = new Map(
    mappings
      .filter((mapping) => mapping.teamId === teamId)
      .map((mapping) => [mapping.taskState, mapping.linearStateId])
  );

  return buildMappingsInput(taskStates, Object.fromEntries(savedMappings));
}

function buildMappingsInput(
  taskStates: readonly TaskState[],
  mappings: Partial<Record<TaskState, string | null>>
): LinearStateMappingInput {
  return Object.fromEntries(
    taskStates.map((taskState) => [taskState, mappings[taskState] ?? null])
  ) as LinearStateMappingInput;
}

function updateDraftMapping(
  mappings: LinearStateMappingInput | null,
  taskState: TaskState,
  linearStateId: string
): LinearStateMappingInput {
  return {
    ...(mappings ?? {}),
    [taskState]: linearStateId.length > 0 ? linearStateId : null
  } as LinearStateMappingInput;
}

function getErrorMessage(error: unknown): string | null {
  if (error == null) {
    return null;
  }

  if (isApiError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to load Linear settings.";
}
