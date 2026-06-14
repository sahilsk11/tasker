import { GitBranch } from "lucide-react";
import { useState } from "react";
import { createTaskSession } from "@/api/tasks";
import type { ApiSession, ApiTaskAction, TaskBundle } from "@/api/tasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TaskActionPromptDialog,
  TaskActionRow,
  TaskActionsDialog
} from "./TaskActions";
import { ResourceGroup, ResourceTableDialog } from "./TaskResources";
import {
  getResourceGroupsForBundle,
  type ResourceKind
} from "./task-resource-groups";

export function TaskGrid({
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

export function TaskGridSkeleton(): React.JSX.Element {
  return (
    <section className="mx-auto grid w-full max-w-[76rem] grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="min-h-72 animate-pulse bg-card/70" />
      ))}
    </section>
  );
}

function TaskCard({ bundle }: { readonly bundle: TaskBundle }): React.JSX.Element {
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

  async function openActionPrompt(action: ApiTaskAction): Promise<void> {
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
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to create task session."
      );
    } finally {
      setIsCreatingPrompt(false);
    }
  }

  function selectAction(action: ApiTaskAction): void {
    const delayMs = showAllActions ? 100 : 0;
    setShowAllActions(false);
    window.setTimeout(() => {
      void openActionPrompt(action);
    }, delayMs);
  }

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
              onSelectAction={selectAction}
              onViewAll={() => setShowAllActions(true)}
            />
            {actionError == null ? null : (
              <p className="text-sm text-destructive">{actionError}</p>
            )}
            {isCreatingPrompt ? (
              <p className="text-sm text-muted-foreground">Preparing prompt...</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <TaskActionsDialog
        actions={bundle.actions}
        onOpenChange={setShowAllActions}
        onSelectAction={selectAction}
        open={showAllActions}
        taskTitle={bundle.task.title}
      />
      <TaskActionPromptDialog
        action={selectedAction}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSelectedAction(null);
            setSelectedSession(null);
          }
        }}
        session={selectedSession}
        taskDescription={bundle.task.description}
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
