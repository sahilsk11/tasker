import {
  FileText,
  FolderGit2,
  GitPullRequest,
  MessageSquareText,
  MoreHorizontal,
  Ticket,
  Workflow
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PullRequestStatusResult } from "@/api/pull-requests";
import { PullRequestStatusBadge } from "./PullRequestStatusBadge";
import type { Resource, ResourceGroupView, ResourceKind } from "./task-resource-groups";
import type { PullRequestStatusMap } from "./use-pull-request-statuses";

const resourceLabels: Record<ResourceKind, string> = {
  artifact: "Artifacts",
  pr: "PRs",
  session: "Sessions",
  subtask: "Subtasks",
  ticket: "Tickets",
  worktree: "Worktrees"
};

const resourceDetailLabels: Record<ResourceKind, string> = {
  artifact: "Format",
  pr: "Host",
  session: "Provider",
  subtask: "Task",
  ticket: "Source",
  worktree: "Location"
};

const resourceIcons: Record<ResourceKind, LucideIcon> = {
  artifact: FileText,
  pr: GitPullRequest,
  session: MessageSquareText,
  subtask: Workflow,
  ticket: Ticket,
  worktree: FolderGit2
};

export function ResourceGroup({
  group,
  onOpen
}: {
  readonly group: ResourceGroupView;
  readonly onOpen: () => void;
}): React.JSX.Element {
  const Icon = resourceIcons[group.kind];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group min-h-20 min-w-0 rounded-lg border border-transparent p-2 text-left",
        "transition-colors hover:border-border hover:bg-secondary/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
      aria-label={`${resourceLabels[group.kind]} resources`}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
        <span className="truncate">{resourceLabels[group.kind]}</span>
        <span className="text-muted-foreground">{group.items.length}</span>
      </div>
      <div className="flex min-h-7 min-w-0 flex-wrap gap-2">
        {group.items.length > 0
          ? group.items.map((resource) => (
              <Badge key={resource.key} variant="outline">
                {resource.label}
              </Badge>
            ))
          : null}
      </div>
    </button>
  );
}

export function ResourceColumnGrid({
  groups,
  onOpen,
  onOpenResource,
  pullRequestStatuses
}: {
  readonly groups: readonly ResourceGroupView[];
  readonly onOpen: (kind: ResourceKind) => void;
  readonly onOpenResource: (resource: Resource) => void;
  readonly pullRequestStatuses: PullRequestStatusMap;
}): React.JSX.Element {
  const visibleKinds: readonly ResourceKind[] = [
    "session",
    "artifact",
    "worktree",
    "pr"
  ];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-4">
      {visibleKinds.map((kind) => {
        const group = groups.find((candidate) => candidate.kind === kind) ?? {
          items: [],
          kind
        };

        return (
          <ResourceColumn
            key={kind}
            group={group}
            onOpen={() => onOpen(kind)}
            onOpenResource={onOpenResource}
            pullRequestStatuses={pullRequestStatuses}
          />
        );
      })}
    </div>
  );
}

function ResourceColumn({
  group,
  onOpen,
  onOpenResource,
  pullRequestStatuses
}: {
  readonly group: ResourceGroupView;
  readonly onOpen: () => void;
  readonly onOpenResource: (resource: Resource) => void;
  readonly pullRequestStatuses: PullRequestStatusMap;
}): React.JSX.Element {
  const Icon = resourceIcons[group.kind];

  return (
    <section className="min-w-0 rounded-lg border border-border/70 bg-secondary/20">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left",
          group.items.length > 0 ? "border-b border-border/70" : "",
          "transition-colors hover:bg-secondary/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-label={`Open ${resourceLabels[group.kind]} resources`}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{resourceLabels[group.kind]}</span>
        </span>
        <Badge variant={group.items.length > 0 ? "secondary" : "outline"}>
          {group.items.length}
        </Badge>
      </button>

      {group.items.length > 0 ? (
        <div className="grid max-h-40 min-w-0 gap-2 overflow-y-auto p-2">
          {group.items.map((resource) => (
            <button
              key={resource.key}
              type="button"
              onClick={() => onOpenResource(resource)}
              className={cn(
                "grid min-w-0 gap-1 rounded-md border border-border/70 bg-card px-2.5 py-2 text-left",
                "transition-colors hover:border-border hover:bg-card/90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <ResourceTitle
                pullRequestStatuses={pullRequestStatuses}
                resource={resource}
              />
              <ResourceSummary
                pullRequestStatuses={pullRequestStatuses}
                resource={resource}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ResourceTableDialog({
  group,
  onOpenResource,
  onOpenChange,
  pullRequestStatuses,
  taskTitle
}: {
  readonly group: ResourceGroupView | null;
  readonly onOpenResource: (resource: Resource) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly pullRequestStatuses: PullRequestStatusMap;
  readonly taskTitle: string;
}): React.JSX.Element {
  const kind = group?.kind ?? "ticket";
  const Icon = resourceIcons[kind];

  return (
    <Dialog open={group != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon className="size-4" />
            <span className="text-xs font-medium uppercase tracking-[0.12em]">
              {resourceLabels[kind]}
            </span>
          </div>
          <DialogTitle>{resourceLabels[kind]}</DialogTitle>
          <DialogDescription>
            Resources attached to {taskTitle}. This is mocked for now and can be
            replaced by the task resource endpoint later.
          </DialogDescription>
        </DialogHeader>

        <div className="border-t border-border">
          <ResourceTable
            group={group}
            onOpenResource={onOpenResource}
            pullRequestStatuses={pullRequestStatuses}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResourceTable({
  group,
  onOpenResource,
  pullRequestStatuses
}: {
  readonly group: ResourceGroupView | null;
  readonly onOpenResource: (resource: Resource) => void;
  readonly pullRequestStatuses: PullRequestStatusMap;
}): React.JSX.Element {
  if (group == null || group.items.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
        No {resourceLabels[group?.kind ?? "ticket"]} attached yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>{resourceDetailLabels[group.kind]}</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="w-28 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {group.items.map((resource) => (
          <TableRow key={resource.key}>
            <TableCell className="font-medium text-foreground">
              {getResourceTitle(resource, pullRequestStatuses)}
            </TableCell>
            <TableCell className="text-muted-foreground">{resource.detail}</TableCell>
            <TableCell>
              {resource.kind === "pr" ? (
                <PullRequestStatusBadge
                  status={getPullRequestStatus(resource, pullRequestStatuses)}
                />
              ) : (
                <Badge variant="secondary">{resource.state}</Badge>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {resource.kind === "pr"
                ? formatPullRequestReference(resource, pullRequestStatuses)
                : resource.updatedAt}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenResource(resource)}
                >
                  {resource.kind === "worktree" ? "Copy" : "Open"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`More actions for ${resource.label}`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ResourceSummary({
  pullRequestStatuses,
  resource
}: {
  readonly pullRequestStatuses: PullRequestStatusMap;
  readonly resource: Resource;
}): React.JSX.Element {
  if (resource.kind === "pr") {
    return (
      <span className="flex min-w-0 items-center justify-between gap-2">
        <PullRequestStatusBadge
          status={getPullRequestStatus(resource, pullRequestStatuses)}
        />
        <span
          className="min-w-0 truncate text-right text-xs text-muted-foreground"
          title={formatPullRequestReference(resource, pullRequestStatuses)}
        >
          {formatPullRequestReference(resource, pullRequestStatuses)}
        </span>
      </span>
    );
  }

  if (resource.kind === "artifact") {
    return (
      <span className="flex min-w-0 items-center justify-between gap-2">
        {resource.metaLabel == null ? null : (
          <Badge className="h-5 shrink-0 px-1.5 text-[11px]" variant="secondary">
            {resource.metaLabel}
          </Badge>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {resource.detail}
        </span>
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <span className="truncate">{resource.detail}</span>
      <span aria-hidden="true">·</span>
      <span className="shrink-0">{resource.updatedAt}</span>
    </span>
  );
}

function ResourceTitle({
  pullRequestStatuses,
  resource
}: {
  readonly pullRequestStatuses: PullRequestStatusMap;
  readonly resource: Resource;
}): React.JSX.Element {
  return (
    <span
      className="truncate text-sm font-medium text-foreground"
      title={getResourceTitle(resource, pullRequestStatuses)}
    >
      {getResourceTitle(resource, pullRequestStatuses)}
    </span>
  );
}

function getPullRequestStatus(
  resource: Resource,
  pullRequestStatuses: PullRequestStatusMap
): PullRequestStatusResult | null {
  return resource.href == null ? null : pullRequestStatuses.get(resource.href) ?? null;
}

function getResourceTitle(
  resource: Resource,
  pullRequestStatuses: PullRequestStatusMap
): string {
  if (resource.kind !== "pr") {
    return resource.label;
  }

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
    return number == null ? "#" : `#${String(number)}`;
  }

  return number == null ? repository : `${repository}#${String(number)}`;
}
