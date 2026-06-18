import {
  FileText,
  GitPullRequest,
  MessageSquareText,
  Ticket,
  Workflow
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PullRequestStatusResult } from "@/api/pull-requests";
import { PullRequestStatusBadge } from "./PullRequestStatusBadge";
import type { Resource, ResourceKind } from "./task-resource-groups";
import type { PullRequestStatusMap } from "./use-pull-request-statuses";

const eventIcons: Partial<Record<ResourceKind, LucideIcon>> = {
  artifact: FileText,
  pr: GitPullRequest,
  session: MessageSquareText,
  subtask: Workflow,
  ticket: Ticket
};

const eventVerbs: Partial<Record<ResourceKind, string>> = {
  artifact: "Artifact saved",
  pr: "Opened",
  session: "Session ran",
  subtask: "Subtask created",
  ticket: "Ticket linked"
};

export function TaskEventLog({
  onOpenResource,
  pullRequestStatuses,
  resources
}: {
  readonly onOpenResource: (resource: Resource) => void;
  readonly pullRequestStatuses: PullRequestStatusMap;
  readonly resources: readonly Resource[];
}): React.JSX.Element {
  const visibleResources = resources.slice(0, 2);

  if (visibleResources.length === 0) {
    return (
      <div className="flex min-h-14 items-center rounded-lg border border-dashed border-border/80 px-3 text-sm text-muted-foreground">
        No resources attached yet.
      </div>
    );
  }

  return (
    <div className="grid gap-1" aria-label="Task event log">
      {visibleResources.map((resource) => (
        <TaskEventRow
          key={resource.key}
          onOpen={() => onOpenResource(resource)}
          pullRequestStatuses={pullRequestStatuses}
          resource={resource}
        />
      ))}
    </div>
  );
}

function TaskEventRow({
  onOpen,
  pullRequestStatuses,
  resource
}: {
  readonly onOpen: () => void;
  readonly pullRequestStatuses: PullRequestStatusMap;
  readonly resource: Resource;
}): React.JSX.Element {
  const Icon = eventIcons[resource.kind] ?? FileText;
  const title = getEventTitle(resource, pullRequestStatuses);
  const note = getEventNote(resource, pullRequestStatuses);
  const iconClassName = getEventIconClassName(resource);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "grid min-h-11 min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-[9px] rounded-md border border-transparent px-2 py-1 text-left",
        "transition-colors hover:border-[#2c2d34] hover:bg-[#16171c] hover:text-[#cdd0d6]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <span className="flex min-w-0 flex-col items-center gap-0.5 pt-0.5">
        <span className={cn("flex size-6 items-center justify-center", iconClassName)}>
          <Icon className="size-4" />
        </span>
        <span className="max-w-7 truncate font-mono text-[9px] leading-none text-[#5c5f68]">
          {resource.updatedAt}
        </span>
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-[#a9abb2]">
          <span className="shrink-0 text-[#83868f]">
            {eventVerbs[resource.kind] ?? "Resource updated"}
          </span>
          <span className="min-w-0 truncate font-medium">{title}</span>
        </span>
        {note == null ? null : <span className="min-w-0">{note}</span>}
      </span>
    </button>
  );
}

function getEventTitle(
  resource: Resource,
  pullRequestStatuses: PullRequestStatusMap
): ReactNode {
  if (resource.kind === "pr") {
    const status = getPullRequestStatus(resource, pullRequestStatuses);

    return (
      <>
        <span className="truncate">
          {formatPullRequestTitle(resource, pullRequestStatuses)}
        </span>
        <PullRequestStatusBadge status={status} />
      </>
    );
  }

  if (resource.kind === "artifact") {
    return <span className="truncate">{resource.label}</span>;
  }

  return resource.label;
}

function getEventNote(
  resource: Resource,
  pullRequestStatuses: PullRequestStatusMap
): ReactNode | null {
  if (resource.kind === "pr") {
    return (
      <span className="block min-w-0 truncate text-sm text-[#83868f]">
        {formatPullRequestReference(resource, pullRequestStatuses)}
      </span>
    );
  }

  if (resource.kind === "artifact") {
    if (resource.metaLabel == null) {
      return null;
    }

    return (
      <Badge
        className="h-5 w-fit rounded-md border-[#1c1d22] bg-[#1a1b21] px-1.5 text-xs text-[#c2c4ca]"
        variant="secondary"
      >
        {resource.metaLabel}
      </Badge>
    );
  }

  if (resource.kind === "session") {
    return (
      <span className="block min-w-0 truncate text-sm text-[#83868f]">
        {resource.detail}
      </span>
    );
  }

  return (
    <span className="block min-w-0 truncate text-sm text-[#83868f]">
      {resource.state}
    </span>
  );
}

function getEventIconClassName(resource: Resource): string {
  if (resource.kind === "pr") {
    return "text-success";
  }

  if (resource.kind === "artifact") {
    return "text-[#8fd6ff]";
  }

  return "text-[#7e818b]";
}

function getPullRequestStatus(
  resource: Resource,
  pullRequestStatuses: PullRequestStatusMap
): PullRequestStatusResult | null {
  return resource.href == null ? null : pullRequestStatuses.get(resource.href) ?? null;
}

function formatPullRequestTitle(
  resource: Resource,
  pullRequestStatuses: PullRequestStatusMap
): string {
  return getPullRequestStatus(resource, pullRequestStatuses)?.title ?? resource.label;
}

function formatPullRequestReference(
  resource: Resource,
  pullRequestStatuses: PullRequestStatusMap
): string {
  const status = getPullRequestStatus(resource, pullRequestStatuses);
  const repository = status?.repository ?? resource.pullRequestRepository;
  const number = status?.number ?? resource.pullRequestNumber;
  if (repository == null) {
    return number == null ? "Pull request" : `#${String(number)}`;
  }

  return number == null ? repository : `${repository}#${String(number)}`;
}
