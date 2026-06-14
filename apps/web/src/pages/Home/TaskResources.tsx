import {
  FileText,
  FolderGit2,
  GitPullRequest,
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
import type { ResourceGroupView, ResourceKind } from "./task-resource-groups";

const resourceLabels: Record<ResourceKind, string> = {
  artifact: "Artifacts",
  pr: "PRs",
  subtask: "Subtasks",
  ticket: "Tickets",
  worktree: "Worktrees"
};

const resourceDetailLabels: Record<ResourceKind, string> = {
  artifact: "Format",
  pr: "Host",
  subtask: "Task",
  ticket: "Source",
  worktree: "Location"
};

const resourceIcons: Record<ResourceKind, LucideIcon> = {
  artifact: FileText,
  pr: GitPullRequest,
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
              <Badge key={`${resource.kind}-${resource.label}`} variant="outline">
                {resource.label}
              </Badge>
            ))
          : null}
      </div>
    </button>
  );
}

export function ResourceTableDialog({
  group,
  onOpenChange,
  taskTitle
}: {
  readonly group: ResourceGroupView | null;
  readonly onOpenChange: (isOpen: boolean) => void;
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
          <ResourceTable group={group} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResourceTable({
  group
}: {
  readonly group: ResourceGroupView | null;
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
          <TableRow key={`${resource.kind}-${resource.label}`}>
            <TableCell className="font-medium text-foreground">{resource.label}</TableCell>
            <TableCell className="text-muted-foreground">{resource.detail}</TableCell>
            <TableCell>
              <Badge variant="secondary">{resource.state}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">{resource.updatedAt}</TableCell>
            <TableCell>
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm">
                  Open
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
