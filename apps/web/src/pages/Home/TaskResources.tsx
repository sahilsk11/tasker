import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  FileText,
  FolderGit2,
  GitPullRequest,
  MessageSquareText,
  MoreHorizontal,
  Trash2,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const visibleKinds: readonly ResourceKind[] = ["session", "artifact", "pr"];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
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
  error,
  group,
  isLoadingArtifacts,
  onArtifactArchive,
  onArtifactDelete,
  onArtifactRestore,
  onOpenResource,
  onOpenChange,
  pendingArtifactAction,
  pullRequestStatuses,
  taskTitle
}: {
  readonly error: string | null;
  readonly group: ResourceGroupView | null;
  readonly isLoadingArtifacts: boolean;
  readonly onArtifactArchive: (resource: Resource) => void;
  readonly onArtifactDelete: (resource: Resource) => void;
  readonly onArtifactRestore: (resource: Resource) => void;
  readonly onOpenResource: (resource: Resource) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly pendingArtifactAction: ArtifactLifecyclePendingAction | null;
  readonly pullRequestStatuses: PullRequestStatusMap;
  readonly taskTitle: string;
}): React.JSX.Element {
  const kind = group?.kind ?? "ticket";
  const Icon = resourceIcons[kind];
  const [artifactView, setArtifactView] = useState<ArtifactView>("active");
  const [pendingDelete, setPendingDelete] = useState<Resource | null>(null);
  const isArtifactGroup = kind === "artifact";
  const artifactRows = useMemo(() => {
    if (group?.kind !== "artifact") {
      return group;
    }

    return {
      ...group,
      items: group.items.filter((resource) =>
        artifactView === "archived"
          ? resource.archivedAt != null
          : resource.archivedAt == null
      )
    };
  }, [artifactView, group]);
  const activeArtifactCount =
    group?.kind === "artifact"
      ? group.items.filter((resource) => resource.archivedAt == null).length
      : 0;
  const archivedArtifactCount =
    group?.kind === "artifact"
      ? group.items.filter((resource) => resource.archivedAt != null).length
      : 0;

  return (
    <Dialog
      open={group != null}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
          setArtifactView("active");
          setPendingDelete(null);
        }
      }}
    >
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
            Resources attached to {taskTitle}.
          </DialogDescription>
        </DialogHeader>

        {isArtifactGroup ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <div className="flex rounded-lg border border-border bg-secondary/20 p-1">
              <Button
                type="button"
                variant={artifactView === "active" ? "default" : "ghost"}
                size="sm"
                className={
                  artifactView === "active"
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary/90"
                    : ""
                }
                onClick={() => setArtifactView("active")}
              >
                Active {activeArtifactCount}
              </Button>
              <Button
                type="button"
                variant={artifactView === "archived" ? "default" : "ghost"}
                size="sm"
                className={
                  artifactView === "archived"
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary/90"
                    : ""
                }
                onClick={() => setArtifactView("archived")}
              >
                Archived {archivedArtifactCount}
              </Button>
            </div>
            {isLoadingArtifacts ? (
              <span className="text-sm text-muted-foreground">Loading artifacts...</span>
            ) : null}
          </div>
        ) : null}
        {error == null ? null : (
          <div className="mx-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="border-t border-border">
          <ResourceTable
            artifactView={artifactView}
            group={artifactRows}
            isLoadingArtifacts={isLoadingArtifacts}
            onArtifactArchive={onArtifactArchive}
            onArtifactDelete={setPendingDelete}
            onArtifactRestore={onArtifactRestore}
            onOpenResource={onOpenResource}
            pendingArtifactAction={pendingArtifactAction}
            pullRequestStatuses={pullRequestStatuses}
          />
        </div>
        <DeleteArtifactDialog
          onCancel={() => setPendingDelete(null)}
          onConfirm={(resource) => {
            onArtifactDelete(resource);
            setPendingDelete(null);
          }}
          pendingAction={pendingArtifactAction}
          resource={pendingDelete}
        />
      </DialogContent>
    </Dialog>
  );
}

type ArtifactView = "active" | "archived";

type ArtifactLifecyclePendingAction = {
  readonly action: "archive" | "delete" | "restore";
  readonly artifactId: string;
  readonly taskId: string;
};

function ResourceTable({
  artifactView,
  group,
  isLoadingArtifacts,
  onArtifactArchive,
  onArtifactDelete,
  onArtifactRestore,
  onOpenResource,
  pendingArtifactAction,
  pullRequestStatuses
}: {
  readonly artifactView: ArtifactView;
  readonly group: ResourceGroupView | null;
  readonly isLoadingArtifacts: boolean;
  readonly onArtifactArchive: (resource: Resource) => void;
  readonly onArtifactDelete: (resource: Resource) => void;
  readonly onArtifactRestore: (resource: Resource) => void;
  readonly onOpenResource: (resource: Resource) => void;
  readonly pendingArtifactAction: ArtifactLifecyclePendingAction | null;
  readonly pullRequestStatuses: PullRequestStatusMap;
}): React.JSX.Element {
  if (group == null || group.items.length === 0) {
    const emptyLabel =
      group?.kind === "artifact" && artifactView === "archived"
        ? "No archived artifacts."
        : `No ${resourceLabels[group?.kind ?? "ticket"]} attached yet.`;

    return (
      <div className="flex min-h-48 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
        {isLoadingArtifacts ? "Loading artifacts..." : emptyLabel}
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
                  Open
                </Button>
                <ResourceActions
                  onArchive={onArtifactArchive}
                  onDelete={onArtifactDelete}
                  onRestore={onArtifactRestore}
                  pendingAction={pendingArtifactAction}
                  resource={resource}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ResourceActions({
  onArchive,
  onDelete,
  onRestore,
  pendingAction,
  resource
}: {
  readonly onArchive: (resource: Resource) => void;
  readonly onDelete: (resource: Resource) => void;
  readonly onRestore: (resource: Resource) => void;
  readonly pendingAction: ArtifactLifecyclePendingAction | null;
  readonly resource: Resource;
}): React.JSX.Element {
  if (resource.kind !== "artifact") {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={`More actions for ${resource.label}`}
        disabled
      >
        <MoreHorizontal className="size-4" />
      </Button>
    );
  }

  const isPending =
    pendingAction?.artifactId === resource.id && pendingAction.taskId === resource.taskId;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`More actions for ${resource.label}`}
          disabled={isPending}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 border-[#1f2025] bg-[#111216] p-1.5">
        <div className="grid gap-1">
          {resource.archivedAt == null ? (
            <Button
              type="button"
              variant="ghost"
              className="h-8 justify-start gap-2 rounded-[7px] px-2 text-sm"
              onClick={() => onArchive(resource)}
            >
              <Archive className="size-4" />
              Archive
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="h-8 justify-start gap-2 rounded-[7px] px-2 text-sm"
              onClick={() => onRestore(resource)}
            >
              <ArchiveRestore className="size-4" />
              Restore
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-8 justify-start gap-2 rounded-[7px] px-2 text-sm text-destructive hover:text-destructive"
            onClick={() => onDelete(resource)}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DeleteArtifactDialog({
  onCancel,
  onConfirm,
  pendingAction,
  resource
}: {
  readonly onCancel: () => void;
  readonly onConfirm: (resource: Resource) => void;
  readonly pendingAction: ArtifactLifecyclePendingAction | null;
  readonly resource: Resource | null;
}): React.JSX.Element {
  const isDeleting =
    resource != null &&
    pendingAction?.action === "delete" &&
    pendingAction.artifactId === resource.id &&
    pendingAction.taskId === resource.taskId;

  return (
    <Dialog
      open={resource != null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <Trash2 className="size-4" />
            <span className="text-xs font-medium uppercase tracking-[0.12em]">
              Permanent delete
            </span>
          </div>
          <DialogTitle>Delete {resource?.label ?? "artifact"}?</DialogTitle>
          <DialogDescription>
            This permanently removes the artifact record and its managed file from
            storage. Use archive if you only want to hide it from active resources.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 border-t border-border p-5 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={resource == null || isDeleting}
            onClick={() => {
              if (resource != null) {
                onConfirm(resource);
              }
            }}
          >
            Delete permanently
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
