import { useState } from "react";
import {
  AlertTriangle,
  Check,
  FileText,
  GitPullRequest,
  MessageSquareText
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { createTaskSession, updateTask } from "@/api/tasks";
import type {
  ApiSession,
  ApiTaskAction,
  ApiTask,
  TaskBundle,
  TaskState,
  TaskStateDefinition
} from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { PullRequestStatusMap } from "./use-pull-request-statuses";
import { TaskEventLog } from "./TaskEventLog";
import {
  TaskActionPromptDialog,
  TaskActionRow,
  TaskActionsDialog
} from "./TaskActions";
import { ResourceTableDialog } from "./TaskResources";
import {
  getResourceGroupsForBundle,
  getTimelineResourcesForBundle,
  type Resource,
  type ResourceGroupView,
  type ResourceKind
} from "./task-resource-groups";

export function TaskGrid({
  bundles,
  onSessionRun,
  pullRequestStatuses,
  taskStateDefinitions
}: {
  readonly bundles: readonly TaskBundle[];
  readonly onSessionRun: () => void;
  readonly pullRequestStatuses: PullRequestStatusMap;
  readonly taskStateDefinitions: readonly TaskStateDefinition[];
}): React.JSX.Element {
  if (bundles.length === 0) {
    return (
      <div className="mx-auto flex min-h-72 w-full max-w-[76rem] items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 text-center text-sm text-muted-foreground">
        No tasks yet. Create one to start tracking resources.
      </div>
    );
  }

  return (
    <section
      className="mx-auto grid w-full max-w-[76rem] grid-cols-1 gap-4 md:grid-cols-2 2xl:max-w-[96rem] 2xl:grid-cols-3"
      aria-label="Tasks"
    >
      {bundles.map((bundle) => (
        <TaskCard
          key={bundle.task.id}
          bundle={bundle}
          onSessionRun={onSessionRun}
          pullRequestStatuses={pullRequestStatuses}
          taskStateDefinitions={taskStateDefinitions}
        />
      ))}
    </section>
  );
}

type TaskStateMeta = {
  readonly iconClassName: string;
};

type PendingDuplicateAction = {
  readonly action: ApiTaskAction;
  readonly closeActionsWhenReady: boolean;
  readonly sessions: readonly ApiSession[];
};

const taskStateMetaByState: Record<TaskState, TaskStateMeta> = {
  done: {
    iconClassName: "border-success/25 bg-success/10 text-success"
  },
  implementation: {
    iconClassName: "border-warning/25 bg-warning/10 text-warning"
  },
  planning: {
    iconClassName: "border-accent/25 bg-accent/10 text-[#a89eff]"
  },
  ready: {
    iconClassName: "border-border bg-[#a1a1aa]/10 text-[#a1a1aa]"
  },
  review: {
    iconClassName: "border-[#a78bfa]/25 bg-[#a78bfa]/10 text-[#a78bfa]"
  },
  scoping: {
    iconClassName: "border-info/25 bg-info/10 text-info"
  }
};

const taskStateSegmentClassByState: Record<TaskState, string> = {
  done: "bg-success",
  implementation: "bg-warning",
  planning: "bg-[#a89eff]",
  ready: "bg-[#a1a1aa]",
  review: "bg-[#a78bfa]",
  scoping: "bg-info"
};

function getTaskStateLabel(
  state: TaskState,
  definitions: readonly TaskStateDefinition[]
): string {
  return (
    definitions.find((definition) => definition.value === state)?.label ??
    state.replaceAll("_", " ")
  );
}

export function TaskGridSkeleton(): React.JSX.Element {
  return (
    <section className="mx-auto grid w-full max-w-[76rem] grid-cols-1 gap-4 md:grid-cols-2 2xl:max-w-[96rem] 2xl:grid-cols-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="min-h-72 animate-pulse bg-card/70" />
      ))}
    </section>
  );
}

function TaskCard({
  bundle,
  onSessionRun,
  pullRequestStatuses,
  taskStateDefinitions
}: {
  readonly bundle: TaskBundle;
  readonly onSessionRun: () => void;
  readonly pullRequestStatuses: PullRequestStatusMap;
  readonly taskStateDefinitions: readonly TaskStateDefinition[];
}): React.JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const groupedResources = getResourceGroupsForBundle(bundle);
  const timelineResources = getTimelineResourcesForBundle(bundle);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCreatingPrompt, setIsCreatingPrompt] = useState(false);
  const [preparingActionId, setPreparingActionId] = useState<string | null>(null);
  const [isStateOpen, setIsStateOpen] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<ApiSession | null>(null);
  const [selectedKind, setSelectedKind] = useState<ResourceKind | null>(null);
  const [selectedAction, setSelectedAction] = useState<ApiTaskAction | null>(null);
  const [pendingDuplicateAction, setPendingDuplicateAction] =
    useState<PendingDuplicateAction | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const selectedGroup =
    groupedResources.find((group) => group.kind === selectedKind) ?? null;
  const stateMutation = useMutation({
    mutationFn: (state: TaskState) => updateTask(bundle.task.id, { state }),
    onError: (error, _state, previousBundles) => {
      if (previousBundles != null) {
        queryClient.setQueryData(["tasks"], previousBundles);
      }
      setStateError(error instanceof Error ? error.message : "Failed to update state.");
    },
    onMutate: async (state) => {
      setStateError(null);
      setIsStateOpen(false);
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previousBundles =
        queryClient.getQueryData<readonly TaskBundle[]>(["tasks"]) ?? undefined;
      queryClient.setQueryData<readonly TaskBundle[]>(["tasks"], (current) =>
        current?.map((candidate) =>
          candidate.task.id === bundle.task.id
            ? {
                ...candidate,
                task: {
                  ...candidate.task,
                  state,
                  updatedAt: new Date().toISOString()
                }
              }
            : candidate
        )
      );
      return previousBundles;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  async function openActionPrompt(
    action: ApiTaskAction,
    {
      closeActionsWhenReady
    }: {
      readonly closeActionsWhenReady: boolean;
    }
  ): Promise<void> {
    setActionError(null);
    setIsCreatingPrompt(true);
    setPreparingActionId(action.id);

    try {
      const session = await createTaskSession(bundle.task.id, {
        actionId: action.id,
        claimed: false,
        provider: "codex"
      });
      setSelectedSession(session);
      setSelectedAction(action);
      if (closeActionsWhenReady) {
        setShowAllActions(false);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to create task session."
      );
    } finally {
      setIsCreatingPrompt(false);
      setPreparingActionId(null);
    }
  }

  function selectAction(action: ApiTaskAction): void {
    const closeActionsWhenReady = showAllActions;
    const existingActionSessions = getExistingActionSessions(
      bundle.resources.sessions,
      action.id
    );

    if (existingActionSessions.length > 0) {
      if (closeActionsWhenReady) {
        setShowAllActions(false);
      }
      setPendingDuplicateAction({
        action,
        closeActionsWhenReady,
        sessions: existingActionSessions
      });
      return;
    }

    void openActionPrompt(action, { closeActionsWhenReady });
  }

  function continueDuplicateAction(): void {
    if (pendingDuplicateAction == null) {
      return;
    }

    const { action, closeActionsWhenReady } = pendingDuplicateAction;
    setPendingDuplicateAction(null);
    void openActionPrompt(action, { closeActionsWhenReady });
  }

  function openAllActions(): void {
    setActionError(null);
    setShowAllActions(true);
  }

  function selectState(state: TaskState): void {
    if (state === bundle.task.state || stateMutation.isPending) {
      setIsStateOpen(false);
      return;
    }

    stateMutation.mutate(state);
  }

  function openResource(resource: Resource): void {
    if (resource.kind === "artifact") {
      void navigate(`/tasks/${resource.taskId}/artifacts/${resource.id}`);
      return;
    }

    if (resource.kind === "pr" && resource.href != null) {
      window.open(resource.href, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <>
      <Card className="grid h-full overflow-hidden rounded-[14px] border-[#1f2025] transition-colors hover:border-[#2c2d34] hover:bg-card lg:grid-cols-[minmax(0,1fr)_9.875rem]">
        <section className="flex min-w-0 flex-col p-4 md:min-h-48">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <TaskStatePicker
                currentState={bundle.task.state}
                disabled={stateMutation.isPending || taskStateDefinitions.length === 0}
                onOpenChange={setIsStateOpen}
                onSelectState={selectState}
                open={isStateOpen}
                stateDefinitions={taskStateDefinitions}
              />
              {stateError == null ? null : (
                <span className="text-sm text-destructive">{stateError}</span>
              )}
            </div>
            <TicketBadge bundle={bundle} />
          </div>

          <CardTitle className="mt-2.5 min-w-0 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] text-lg font-semibold leading-6 text-[#f1f2f4]">
            {bundle.task.title}
          </CardTitle>

          <div className="mt-2 min-w-0 flex-1">
            <TaskEventLog
              onOpenResource={(resource) => setSelectedKind(resource.kind)}
              pullRequestStatuses={pullRequestStatuses}
              resources={timelineResources}
            />
          </div>

          <ResourceCounters
            groups={groupedResources}
            onOpen={setSelectedKind}
            onOpenSubtasks={() => setSelectedKind("subtask")}
            subtasks={bundle.children}
          />
        </section>

        <aside className="flex min-w-0 flex-col justify-center border-t border-[#1c1d22] bg-[#0f1013] p-[15px_14px] lg:border-l lg:border-t-0">
          <TaskActionRow
            actions={bundle.actions}
            isPreparingPrompt={isCreatingPrompt}
            layout="rail"
            onSelectAction={selectAction}
            onViewAll={openAllActions}
            preparingActionId={preparingActionId}
          />
        </aside>
      </Card>

      <TaskActionsDialog
        actions={bundle.actions}
        error={actionError}
        isPreparingPrompt={isCreatingPrompt}
        onOpenChange={setShowAllActions}
        onSelectAction={selectAction}
        open={showAllActions}
        taskTitle={bundle.task.title}
      />
      <TaskActionPromptDialog
        action={selectedAction}
        onBack={() => {
          setSelectedAction(null);
          setSelectedSession(null);
          setShowAllActions(true);
        }}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSelectedAction(null);
            setSelectedSession(null);
          }
        }}
        onRunComplete={(session) => {
          setSelectedSession(session);
          onSessionRun();
        }}
        session={selectedSession}
        taskId={bundle.task.id}
      />
      <DuplicateActionWarningDialog
        pendingAction={pendingDuplicateAction}
        onCancel={() => setPendingDuplicateAction(null)}
        onContinue={continueDuplicateAction}
      />
      <ResourceTableDialog
        group={selectedGroup}
        onOpenResource={openResource}
        pullRequestStatuses={pullRequestStatuses}
        taskTitle={bundle.task.title}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSelectedKind(null);
          }
        }}
      />
    </>
  );
}

function DuplicateActionWarningDialog({
  onCancel,
  onContinue,
  pendingAction
}: {
  readonly onCancel: () => void;
  readonly onContinue: () => void;
  readonly pendingAction: PendingDuplicateAction | null;
}): React.JSX.Element {
  const latestSession = pendingAction?.sessions[0] ?? null;
  const sessionCount = pendingAction?.sessions.length ?? 0;

  return (
    <Dialog
      open={pendingAction != null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle className="size-4" />
            <span className="text-xs font-medium uppercase tracking-[0.12em]">
              Duplicate work warning
            </span>
          </div>
          <DialogTitle>{pendingAction?.action.label ?? "Action"} already ran</DialogTitle>
          <DialogDescription>
            This task already has {sessionCountText(sessionCount)} for this action.
            Starting another one can duplicate work.
          </DialogDescription>
        </DialogHeader>

        {latestSession == null ? null : (
          <div className="mx-5 rounded-lg border border-border bg-secondary/25 px-3 py-2 text-sm">
            <div className="font-medium text-foreground">
              {latestSession.displayTitle ??
                latestSession.providerId ??
                capitalize(latestSession.provider)}
            </div>
            <div className="mt-1 text-muted-foreground">
              {capitalize(latestSession.provider)} session,{" "}
              {formatSessionTime(latestSession.claimedAt ?? latestSession.createdAt)}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border p-5 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="default" onClick={onContinue}>
            Continue anyway
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getExistingActionSessions(
  sessions: readonly ApiSession[],
  actionId: string
): readonly ApiSession[] {
  return sessions
    .filter((session) => session.actionId === actionId)
    .sort((left, right) => getSessionTime(right) - getSessionTime(left));
}

function getSessionTime(session: ApiSession): number {
  const value = new Date(session.claimedAt ?? session.createdAt).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function sessionCountText(count: number): string {
  return `${String(count)} ${count === 1 ? "session" : "sessions"}`;
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown time";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function capitalize(value: string): string {
  const firstCharacter = value[0];
  return firstCharacter == null ? value : `${firstCharacter.toUpperCase()}${value.slice(1)}`;
}

function TaskStatePicker({
  currentState,
  disabled,
  onOpenChange,
  onSelectState,
  open,
  stateDefinitions
}: {
  readonly currentState: TaskState;
  readonly disabled: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelectState: (state: TaskState) => void;
  readonly open: boolean;
  readonly stateDefinitions: readonly TaskStateDefinition[];
}): React.JSX.Element {
  const stateMeta = taskStateMetaByState[currentState];
  const stateLabel = getTaskStateLabel(currentState, stateDefinitions);
  const orderedStateDefinitions = [...stateDefinitions].sort((left, right) => {
    const rankComparison = left.rank - right.rank;
    return rankComparison === 0 ? left.value.localeCompare(right.value) : rankComparison;
  });

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-7 rounded-full px-3 text-[13px] font-semibold",
            stateMeta.iconClassName
          )}
          title={`Task state: ${stateLabel}`}
        >
          <span className="size-2 rounded-full bg-current" aria-hidden="true" />
          {stateLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 border-[#1f2025] bg-[#111216] p-1.5">
        <div className="flex flex-col gap-1">
          {orderedStateDefinitions.map((definition) => {
            const optionMeta = taskStateMetaByState[definition.value];
            const isSelected = definition.value === currentState;

            return (
              <Button
                key={definition.value}
                type="button"
                variant="ghost"
                className="h-8 justify-start rounded-[7px] px-2 text-sm font-medium text-[#cdd0d6] hover:bg-[#191a20] hover:text-[#f1f2f4]"
                onClick={() => onSelectState(definition.value)}
              >
                <span
                  className={cn("size-2 rounded-full", optionMeta.iconClassName)}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-left">
                  {definition.label}
                </span>
                {isSelected ? <Check className="size-4 text-[#7c6cff]" /> : null}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ResourceCounters({
  groups,
  onOpen,
  onOpenSubtasks,
  subtasks
}: {
  readonly groups: readonly ResourceGroupView[];
  readonly onOpen: (kind: ResourceKind) => void;
  readonly onOpenSubtasks: () => void;
  readonly subtasks: readonly ApiTask[];
}): React.JSX.Element {
  const counters: ReadonlyArray<{
    readonly Icon: typeof MessageSquareText;
    readonly kind: ResourceKind;
  }> = [
    { Icon: MessageSquareText, kind: "session" },
    { Icon: FileText, kind: "artifact" },
    { Icon: GitPullRequest, kind: "pr" }
  ];

  return (
    <div className="mt-2.5 flex min-w-0 flex-wrap gap-1.5">
      {counters.map(({ Icon, kind }) => {
        const group = groups.find((candidate) => candidate.kind === kind) ?? {
          items: [],
          kind
        };

        return (
          <Button
            key={kind}
            type="button"
            variant="outline"
            className="h-auto min-w-0 gap-2 rounded-[7px] border-[#1c1d22] bg-[#0e0f12] px-2.5 py-1.5 text-xs font-medium text-[#9aa0aa] hover:border-[#2c2d34] hover:bg-[#16171c] hover:text-[#cdd0d6]"
            onClick={() => onOpen(kind)}
            title={`Open ${kind} resources`}
          >
            <Icon className="size-3.5" />
            <span>{group.items.length}</span>
          </Button>
        );
      })}
      <SubtaskToggle onOpen={onOpenSubtasks} subtasks={subtasks} />
    </div>
  );
}

function SubtaskToggle({
  onOpen,
  subtasks
}: {
  readonly onOpen: () => void;
  readonly subtasks: readonly ApiTask[];
}): React.JSX.Element | null {
  if (subtasks.length === 0) {
    return null;
  }

  const orderedSubtasks = getOrderedSubtasks(subtasks);

  return (
    <Button
      type="button"
      variant="outline"
      className="ml-auto h-9 min-w-0 rounded-[9px] border-[#24252b] bg-[#101116] px-3 text-[#cdd0d6] hover:border-[#32333a] hover:bg-[#16171c] hover:text-[#f1f2f4]"
      onClick={onOpen}
      aria-label={`Open ${String(subtasks.length)} subtasks`}
      title="Open subtasks"
    >
      <SubtaskProgress subtasks={orderedSubtasks} />
    </Button>
  );
}

function SubtaskProgress({
  subtasks
}: {
  readonly subtasks: readonly ApiTask[];
}): React.JSX.Element {
  return (
    <span className="flex shrink-0 gap-1" aria-hidden="true">
      {subtasks.map((subtask) => (
        <span
          key={subtask.id}
          className={cn(
            "h-1.5 w-5 rounded-full",
            taskStateSegmentClassByState[subtask.state]
          )}
        />
      ))}
    </span>
  );
}

function getOrderedSubtasks(subtasks: readonly ApiTask[]): readonly ApiTask[] {
  return [...subtasks].sort((left, right) => {
    const createdAtComparison =
      getTaskTime(left.createdAt) - getTaskTime(right.createdAt);

    return createdAtComparison === 0
      ? left.id.localeCompare(right.id)
      : createdAtComparison;
  });
}

function getTaskTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function TicketBadge({
  bundle
}: {
  readonly bundle: TaskBundle;
}): React.JSX.Element | null {
  const ticket = bundle.resources.tickets[0];
  if (ticket == null) {
    return null;
  }

  if (ticket.url == null) {
    return (
      <Badge
        variant="outline"
        className="h-7 shrink-0 rounded-full border-[#1f2026] bg-transparent px-2.5 font-mono text-xs font-normal text-[#6b6e76]"
      >
        {ticket.externalId}
      </Badge>
    );
  }

  return (
    <a
      href={ticket.url}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`Open ${ticket.externalId}`}
    >
      <Badge
        variant="outline"
        className="h-7 cursor-pointer rounded-full border-[#1f2026] bg-transparent px-2.5 font-mono text-xs font-normal text-[#6b6e76] transition-colors hover:border-[#2c2d34] hover:text-[#cdd0d6]"
      >
        {ticket.externalId}
      </Badge>
    </a>
  );
}
