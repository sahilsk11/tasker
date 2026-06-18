import { useState } from "react";
import { FileText, GitPullRequest, MessageSquareText } from "lucide-react";
import { useNavigate } from "react-router";
import { createTaskSession } from "@/api/tasks";
import type { ApiSession, ApiTaskAction, TaskBundle, TaskState } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
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
  pullRequestStatuses
}: {
  readonly bundles: readonly TaskBundle[];
  readonly onSessionRun: () => void;
  readonly pullRequestStatuses: PullRequestStatusMap;
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
        />
      ))}
    </section>
  );
}

type TaskStateMeta = {
  readonly iconClassName: string;
  readonly label: string;
};

const taskStateMeta: Record<TaskState, TaskStateMeta> = {
  code_review: {
    iconClassName: "border-[#a78bfa]/25 bg-[#a78bfa]/10 text-[#a78bfa]",
    label: "In review"
  },
  done: {
    iconClassName: "border-success/25 bg-success/10 text-success",
    label: "Done"
  },
  implement: {
    iconClassName: "border-warning/25 bg-warning/10 text-warning",
    label: "Implementing"
  },
  merged: {
    iconClassName: "border-[#a78bfa]/25 bg-[#a78bfa]/10 text-[#a78bfa]",
    label: "Merged"
  },
  plan: {
    iconClassName: "border-accent/25 bg-accent/10 text-[#a89eff]",
    label: "Plan"
  },
  ready: {
    iconClassName: "border-border bg-[#a1a1aa]/10 text-[#a1a1aa]",
    label: "Ready"
  },
  research: {
    iconClassName: "border-info/25 bg-info/10 text-info",
    label: "Researching"
  }
};

function getTaskStateMeta(state: TaskState | undefined): TaskStateMeta {
  return state == null ? taskStateMeta.ready : taskStateMeta[state];
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
  pullRequestStatuses
}: {
  readonly bundle: TaskBundle;
  readonly onSessionRun: () => void;
  readonly pullRequestStatuses: PullRequestStatusMap;
}): React.JSX.Element {
  const navigate = useNavigate();
  const groupedResources = getResourceGroupsForBundle(bundle);
  const timelineResources = getTimelineResourcesForBundle(bundle);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCreatingPrompt, setIsCreatingPrompt] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ApiSession | null>(null);
  const [selectedKind, setSelectedKind] = useState<ResourceKind | null>(null);
  const [selectedAction, setSelectedAction] = useState<ApiTaskAction | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const selectedGroup =
    groupedResources.find((group) => group.kind === selectedKind) ?? null;
  const stateMeta = getTaskStateMeta(bundle.task.state);

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
    }
  }

  function selectAction(action: ApiTaskAction): void {
    void openActionPrompt(action, { closeActionsWhenReady: showAllActions });
  }

  function openAllActions(): void {
    setActionError(null);
    setShowAllActions(true);
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
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge
              className={cn(
                "h-7 rounded-full px-3 text-[13px]",
                stateMeta.iconClassName
              )}
              title={`Task state: ${stateMeta.label}`}
              variant="outline"
            >
              <span className="size-2 rounded-full bg-current" aria-hidden="true" />
              {stateMeta.label}
            </Badge>
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

          <ResourceCounters groups={groupedResources} onOpen={setSelectedKind} />
        </section>

        <aside className="flex min-w-0 flex-col justify-center border-t border-[#1c1d22] bg-[#0f1013] p-[15px_14px] lg:border-l lg:border-t-0">
          <TaskActionRow
            actions={bundle.actions}
            layout="rail"
            onSelectAction={selectAction}
            onViewAll={openAllActions}
          />
          <div className="mt-4">
            {actionError == null ? null : (
              <p className="text-sm text-destructive">{actionError}</p>
            )}
            {isCreatingPrompt && !showAllActions ? (
              <p className="text-sm text-muted-foreground">Preparing prompt...</p>
            ) : null}
          </div>
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

function ResourceCounters({
  groups,
  onOpen
}: {
  readonly groups: readonly ResourceGroupView[];
  readonly onOpen: (kind: ResourceKind) => void;
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
    </div>
  );
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
