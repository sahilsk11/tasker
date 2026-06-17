import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Code2,
  FileSearch,
  GitMerge,
  GitPullRequest,
  ListChecks
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { createTaskSession } from "@/api/tasks";
import type { ApiSession, ApiTaskAction, TaskBundle, TaskState } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PullRequestStatusMap } from "./use-pull-request-statuses";
import {
  TaskActionPromptDialog,
  TaskActionRow,
  TaskActionsDialog
} from "./TaskActions";
import { ResourceColumnGrid, ResourceTableDialog } from "./TaskResources";
import {
  getResourceGroupsForBundle,
  type Resource,
  type ResourceKind
} from "./task-resource-groups";

export function TaskGrid({
  bundles,
  pullRequestStatuses
}: {
  readonly bundles: readonly TaskBundle[];
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
      className="mx-auto grid w-full max-w-[76rem] grid-cols-1 gap-4 md:grid-cols-2"
      aria-label="Tasks"
    >
      {bundles.map((bundle) => (
        <TaskCard
          key={bundle.task.id}
          bundle={bundle}
          pullRequestStatuses={pullRequestStatuses}
        />
      ))}
    </section>
  );
}

type TaskStateMeta = {
  readonly Icon: LucideIcon;
  readonly iconClassName: string;
  readonly label: string;
};

const taskStateMeta: Record<TaskState, TaskStateMeta> = {
  code_review: {
    Icon: GitPullRequest,
    iconClassName: "border-info/30 bg-info/10 text-info",
    label: "Code review"
  },
  done: {
    Icon: CheckCircle2,
    iconClassName: "border-success/30 bg-success/10 text-success",
    label: "Done"
  },
  implement: {
    Icon: Code2,
    iconClassName: "border-accent/30 bg-accent/15 text-accent-foreground",
    label: "Implement"
  },
  merged: {
    Icon: GitMerge,
    iconClassName: "border-accent/30 bg-accent/15 text-accent-foreground",
    label: "Merged"
  },
  plan: {
    Icon: ListChecks,
    iconClassName: "border-warning/30 bg-warning/10 text-warning",
    label: "Plan"
  },
  ready: {
    Icon: Circle,
    iconClassName: "border-border bg-secondary text-secondary-foreground",
    label: "Ready"
  },
  research: {
    Icon: FileSearch,
    iconClassName: "border-info/30 bg-info/10 text-info",
    label: "Research"
  }
};

function getTaskStateMeta(state: TaskState | undefined): TaskStateMeta {
  return state == null ? taskStateMeta.ready : taskStateMeta[state];
}

export function TaskGridSkeleton(): React.JSX.Element {
  return (
    <section className="mx-auto grid w-full max-w-[76rem] grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="min-h-72 animate-pulse bg-card/70" />
      ))}
    </section>
  );
}

function TaskCard({
  bundle,
  pullRequestStatuses
}: {
  readonly bundle: TaskBundle;
  readonly pullRequestStatuses: PullRequestStatusMap;
}): React.JSX.Element {
  const navigate = useNavigate();
  const groupedResources = getResourceGroupsForBundle(bundle);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCreatingPrompt, setIsCreatingPrompt] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ApiSession | null>(null);
  const [selectedKind, setSelectedKind] = useState<ResourceKind | null>(null);
  const [selectedAction, setSelectedAction] = useState<ApiTaskAction | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const selectedGroup =
    groupedResources.find((group) => group.kind === selectedKind) ?? null;
  const description = bundle.task.description ?? "No description provided.";
  const recommendedActions = bundle.actions.filter((action) => action.isRecommended);
  const stateMeta = getTaskStateMeta(bundle.task.state);
  const StateIcon = stateMeta.Icon;

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
      <Card className="flex h-full flex-col overflow-hidden transition-colors hover:border-border/80 hover:bg-card/95">
        <CardHeader className="pb-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className={cn(
                  "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border",
                  stateMeta.iconClassName
                )}
                title={`Task state: ${stateMeta.label}`}
              >
                <StateIcon className="size-4" />
              </span>
              <CardTitle className="min-w-0 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] text-xl leading-7">
                {bundle.task.title}
              </CardTitle>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <TicketBadge bundle={bundle} />
            </div>
          </div>
          <p className="mt-3 min-h-12 overflow-hidden text-sm leading-6 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {description}
          </p>
          <div className="mt-5 h-px bg-border/70" />
        </CardHeader>

        <CardContent className="flex flex-1 flex-col">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <div className="min-w-0 flex-1">
              <ResourceColumnGrid
                groups={groupedResources}
                onOpen={setSelectedKind}
                onOpenResource={openResource}
                pullRequestStatuses={pullRequestStatuses}
              />
            </div>
            <TaskActionRow
              actions={recommendedActions}
              onSelectAction={selectAction}
              onViewAll={openAllActions}
            />
            {actionError == null ? null : (
              <p className="text-sm text-destructive">{actionError}</p>
            )}
            {isCreatingPrompt && !showAllActions ? (
              <p className="text-sm text-muted-foreground">Preparing prompt...</p>
            ) : null}
          </div>
        </CardContent>
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
      <Badge variant="outline" className="shrink-0">
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
        className="cursor-pointer transition-colors hover:border-border hover:text-foreground"
      >
        {ticket.externalId}
      </Badge>
    </a>
  );
}
