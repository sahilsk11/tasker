import {
  ClipboardCheck,
  Code2,
  FileText,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  ListTree,
  MapIcon,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Ticket,
  Workflow
} from "lucide-react";
import { type SyntheticEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTask,
  createTaskTicket,
  listTaskBundles,
  type ApiArtifact,
  type ApiTaskAction,
  type TaskBundle
} from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type ResourceKind = "ticket" | "session" | "artifact" | "worktree" | "pr" | "subtask";

type Resource = {
  readonly detail: string;
  readonly kind: ResourceKind;
  readonly label: string;
  readonly state: string;
  readonly updatedAt: string;
};

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

const resourceIcons: Record<ResourceKind, typeof Ticket> = {
  artifact: FileText,
  pr: GitPullRequest,
  session: MessageSquareText,
  subtask: Workflow,
  ticket: Ticket,
  worktree: FolderGit2
};

const resourceOrder: readonly ResourceKind[] = [
  "ticket",
  "session",
  "artifact",
  "worktree",
  "pr",
  "subtask"
];

const taskActionIcons: Record<string, typeof Ticket> = {
  breakdown: ListTree,
  code_review: ClipboardCheck,
  implement: Code2,
  investigate: Search,
  new_session: MessageSquareText,
  plan: MapIcon
};

export function HomePage(): React.JSX.Element {
  const tasksQuery = useQuery({
    queryFn: listTaskBundles,
    queryKey: ["tasks"]
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-border/70 pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-normal sm:text-3xl">
              Tasker
            </h1>
          </div>
          <NewTaskDialog />
        </header>

        {tasksQuery.isLoading ? <TaskGridSkeleton /> : null}
        {tasksQuery.isError ? <LoadError error={tasksQuery.error} /> : null}
        {tasksQuery.isSuccess ? <TaskGrid bundles={tasksQuery.data} /> : null}
      </div>
    </main>
  );
}

function TaskGrid({
  bundles
}: {
  readonly bundles: readonly TaskBundle[];
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
        <TaskCard key={bundle.task.id} bundle={bundle} />
      ))}
    </section>
  );
}

function TaskCard({ bundle }: { readonly bundle: TaskBundle }): React.JSX.Element {
  const groupedResources = groupResources(getResourcesForBundle(bundle));
  const [selectedKind, setSelectedKind] = useState<ResourceKind | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const selectedGroup =
    groupedResources.find((group) => group.kind === selectedKind) ?? null;
  const description = bundle.task.description ?? "No description provided.";

  return (
    <>
      <Card className="overflow-hidden transition-colors hover:border-border/80 hover:bg-card/95">
        <CardHeader className="pb-5">
          <CardTitle className="min-w-0 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] text-xl leading-7">
            {bundle.task.title}
          </CardTitle>
          <p className="mt-3 min-h-12 overflow-hidden text-sm leading-6 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {description}
          </p>
          <div className="mt-5 h-px bg-border/70" />
        </CardHeader>

        <CardContent>
          <div className="grid min-w-0 gap-6">
            <div>
              <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                <GitBranch className="size-3.5" />
                Resources
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                {groupedResources.map((group) => (
                  <ResourceGroup
                    key={group.kind}
                    group={group}
                    onOpen={() => setSelectedKind(group.kind)}
                  />
                ))}
              </div>
            </div>
            <TaskActionRow
              actions={bundle.actions}
              onViewAll={() => setShowAllActions(true)}
            />
          </div>
        </CardContent>
      </Card>

      <TaskActionsDialog
        actions={bundle.actions}
        onOpenChange={setShowAllActions}
        open={showAllActions}
        taskTitle={bundle.task.title}
      />
      <ResourceTableDialog
        group={selectedGroup}
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

function TaskActionRow({
  actions,
  onViewAll
}: {
  readonly actions: readonly ApiTaskAction[];
  readonly onViewAll: () => void;
}): React.JSX.Element {
  const recommendedActions = actions.filter((action) => action.isRecommended).slice(0, 2);

  return (
    <div className="min-w-0 border-t border-border/70 pt-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {recommendedActions.map((action) => (
          <TaskActionButton key={action.id} action={action} />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="col-span-2 min-w-0 justify-center sm:col-span-1"
          onClick={onViewAll}
        >
          <MoreHorizontal className="size-4" />
          <span>View all</span>
        </Button>
      </div>
    </div>
  );
}

function TaskActionButton({
  action
}: {
  readonly action: ApiTaskAction;
}): React.JSX.Element {
  const Icon = taskActionIcons[action.id] ?? Workflow;

  return (
    <Button type="button" variant="default" size="sm" className="min-w-0 justify-center">
      <Icon className="size-4" />
      <span>{action.label}</span>
    </Button>
  );
}

function TaskActionsDialog({
  actions,
  onOpenChange,
  open,
  taskTitle
}: {
  readonly actions: readonly ApiTaskAction[];
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly open: boolean;
  readonly taskTitle: string;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Workflow className="size-4" />
            <span className="text-xs font-medium uppercase tracking-[0.12em]">
              Actions
            </span>
          </div>
          <DialogTitle>Task actions</DialogTitle>
          <DialogDescription>
            Suggested prompts for {taskTitle}. Starting sessions is not wired yet.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-2 overflow-y-auto border-t border-border p-5">
          {actions.map((action) => (
            <TaskActionListItem key={action.id} action={action} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskActionListItem({
  action
}: {
  readonly action: ApiTaskAction;
}): React.JSX.Element {
  const Icon = taskActionIcons[action.id] ?? Workflow;

  return (
    <button
      type="button"
      className={cn(
        "grid min-w-0 gap-2 rounded-lg border border-border p-3 text-left",
        "transition-colors hover:bg-secondary/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{action.label}</span>
        {action.isRecommended ? <Badge variant="secondary">Recommended</Badge> : null}
      </div>
      <p className="text-sm leading-5 text-muted-foreground">{action.description}</p>
      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
        {action.prompt}
      </p>
    </button>
  );
}

function NewTaskDialog(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ticket, setTicket] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const task = await createTask({
        description: normalizeOptionalText(description),
        parentTaskId: null,
        title: title.trim()
      });
      const ticketInput = parseTicketInput(ticket);
      if (ticketInput != null) {
        await createTaskTicket(task.id, ticketInput);
      }
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setTicket("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const canSubmit = title.trim().length > 0 && !mutation.isPending;
  const errorMessage = mutation.isError ? getMutationErrorMessage(mutation.error) : null;

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    await mutation.mutateAsync();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New task
      </Button>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Create the task now. Ticket linkage is optional and can be filled in later.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 border-t border-border p-5" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-2">
            <Label htmlFor="task-title">Name</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add cursor support"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What should the agent do?"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-ticket">Ticket ID or URL</Label>
            <Input
              id="task-ticket"
              value={ticket}
              onChange={(event) => setTicket(event.target.value)}
              placeholder="SAS-32 or https://linear.app/..."
            />
          </div>
          {errorMessage != null ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? "Creating..." : "Create task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ResourceGroupView = {
  readonly items: readonly Resource[];
  readonly kind: ResourceKind;
};

function ResourceGroup({
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

function ResourceTableDialog({
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
                <Button variant="ghost" size="icon" aria-label={`More actions for ${resource.label}`}>
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

function groupResources(resources: readonly Resource[]): readonly ResourceGroupView[] {
  const groups = new Map<ResourceKind, Resource[]>();
  for (const resource of resources) {
    const existing = groups.get(resource.kind) ?? [];
    existing.push(resource);
    groups.set(resource.kind, existing);
  }

  return resourceOrder.map((kind) => ({ items: groups.get(kind) ?? [], kind }));
}

function getResourcesForBundle(bundle: TaskBundle): readonly Resource[] {
  return [
    ...bundle.resources.tickets.map((ticket) =>
      resource(
        "ticket",
        ticket.externalId,
        ticket.url == null ? "Ticket" : getUrlHost(ticket.url),
        ticket.url == null ? "Unlinked" : "Linked",
        formatDate(ticket.createdAt)
      )
    ),
    ...bundle.resources.sessions.map((session) =>
      resource(
        "session",
        session.provider,
        capitalize(session.provider),
        "Created",
        formatDate(session.createdAt)
      )
    ),
    ...bundle.resources.artifacts.map(resourceFromArtifact),
    ...bundle.children.map((child) =>
      resource(
        "subtask",
        child.title,
        child.id.slice(0, 8),
        "Open",
        formatDate(child.createdAt)
      )
    )
  ];
}

function resourceFromArtifact(artifact: ApiArtifact): Resource {
  const kind = getArtifactResourceKind(artifact.kind);
  return resource(
    kind,
    artifact.label,
    kind === "artifact" ? artifact.kind : artifact.uri,
    "Ready",
    formatDate(artifact.createdAt)
  );
}

function getArtifactResourceKind(kind: string): ResourceKind {
  const normalized = kind.toLowerCase();
  if (normalized === "pr" || normalized === "pull_request" || normalized === "pull-request") {
    return "pr";
  }

  if (normalized === "worktree") {
    return "worktree";
  }

  return "artifact";
}

function resource(
  kind: ResourceKind,
  label: string,
  detail: string,
  state: string,
  updatedAt: string
): Resource {
  return { detail, kind, label, state, updatedAt };
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseTicketInput(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (isUrl(trimmed)) {
    return {
      externalId: getTicketIdFromUrl(trimmed),
      url: trimmed
    };
  }

  return {
    externalId: trimmed,
    url: null
  };
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getTicketIdFromUrl(value: string): string {
  const url = new URL(value);
  const lastPathSegment = url.pathname.split("/").filter(Boolean).at(-1);
  return lastPathSegment ?? value;
}

function getUrlHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "URL";
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short"
  }).format(date);
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function getMutationErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to create task.";
}

function LoadError({ error }: { readonly error: unknown }): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[76rem] rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error instanceof Error ? error.message : "Failed to load tasks."}
    </div>
  );
}

function TaskGridSkeleton(): React.JSX.Element {
  return (
    <section className="mx-auto grid w-full max-w-[76rem] grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="min-h-72 animate-pulse bg-card/70" />
      ))}
    </section>
  );
}
