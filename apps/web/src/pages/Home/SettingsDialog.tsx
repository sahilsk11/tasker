import { renderTaskActionTemplate } from "@tasker/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardCheck,
  Code2,
  ListTree,
  LoaderCircle,
  MapIcon,
  MessageSquareText,
  Save,
  Search,
  Settings,
  Workflow
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  ApiTaskActionDetails,
  ApiTaskActionOptions,
  UpdateTaskActionInput
} from "@/api/tasks";
import {
  listTaskActionSettings,
  updateTaskActionSettings
} from "@/api/tasks";
import { MarkdownDocument } from "@/components/MarkdownDocument";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { taskActionIcons } from "./task-action-icons";

type ActionDraft = {
  readonly description: string;
  readonly enabled: boolean;
  readonly iconName: string;
  readonly label: string;
  readonly options: ApiTaskActionOptions | null;
  readonly promptTemplate: string;
  readonly sortOrder: string;
};

const iconOptions = [
  { Icon: Search, label: "Search", value: "search" },
  { Icon: MapIcon, label: "Map", value: "map" },
  { Icon: ListTree, label: "List tree", value: "list-tree" },
  { Icon: Code2, label: "Code", value: "code-2" },
  { Icon: ClipboardCheck, label: "Clipboard check", value: "clipboard-check" },
  {
    Icon: MessageSquareText,
    label: "Message",
    value: "message-square-text"
  },
  { Icon: Workflow, label: "Workflow", value: "workflow" }
];

export function SettingsDialog(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const queryClient = useQueryClient();
  const actionsQuery = useQuery({
    enabled: isOpen,
    queryFn: listTaskActionSettings,
    queryKey: ["action-settings"]
  });
  const actions = actionsQuery.data ?? [];
  const selectedAction =
    actions.find((action) => action.id === selectedActionId) ?? actions[0] ?? null;
  const saveMutation = useMutation({
    mutationFn: ({
      actionId,
      input
    }: {
      readonly actionId: string;
      readonly input: UpdateTaskActionInput;
    }) => updateTaskActionSettings(actionId, input),
    onSuccess: async (updatedAction) => {
      setDraft(toDraft(updatedAction));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["action-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] })
      ]);
    }
  });

  useEffect(() => {
    if (selectedAction != null && selectedAction.id !== selectedActionId) {
      setSelectedActionId(selectedAction.id);
    }
  }, [selectedAction, selectedActionId]);

  useEffect(() => {
    setDraft(selectedAction == null ? null : toDraft(selectedAction));
  }, [selectedAction]);

  const preview = useMemo(() => {
    if (draft == null || selectedAction == null) {
      return "";
    }

    try {
      return renderTaskActionTemplate(draft.promptTemplate, {
        action: {
          id: selectedAction.id,
          label: draft.label
        },
        apiBaseUrl: "http://127.0.0.1:3000",
        sessionId: "preview-session",
        taskDescription: "Preview task description.",
        taskId: "preview-task",
        taskTitle: "Preview task",
        ...(draft.options?.worktree?.default
          ? { worktree: { enabled: true, path: "~/wt/tasker-preview" } }
          : {})
      });
    } catch (error) {
      return error instanceof Error ? error.message : "Unable to render preview.";
    }
  }, [draft, selectedAction]);

  function saveSelectedAction(): void {
    if (draft == null || selectedAction == null) {
      return;
    }

    saveMutation.mutate({
      actionId: selectedAction.id,
      input: {
        description: draft.description,
        enabled: draft.enabled,
        iconName: draft.iconName,
        label: draft.label,
        options: draft.options,
        promptTemplate: draft.promptTemplate,
        sortOrder: Number.parseInt(draft.sortOrder, 10)
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="fixed bottom-4 left-4 z-40 shadow-lg"
        onClick={() => setIsOpen(true)}
      >
        <Settings className="size-4" />
        <span>Settings</span>
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-6xl grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Settings className="size-4" />
              <span className="text-xs font-medium uppercase tracking-[0.12em]">
                Settings
              </span>
            </div>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Manage action labels, prompts, icons, and options.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 border-t border-border md:grid-cols-[15rem_minmax(0,1fr)]">
            <SettingsSidebar
              actions={actions}
              isLoading={actionsQuery.isLoading}
              selectedActionId={selectedAction?.id ?? null}
              onSelectAction={setSelectedActionId}
            />
            <ActionEditor
              draft={draft}
              error={
                actionsQuery.error instanceof Error
                  ? actionsQuery.error.message
                  : saveMutation.error instanceof Error
                    ? saveMutation.error.message
                    : null
              }
              isSaving={saveMutation.isPending}
              preview={preview}
              selectedAction={selectedAction}
              onDraftChange={setDraft}
              onSave={saveSelectedAction}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SettingsSidebar({
  actions,
  isLoading,
  onSelectAction,
  selectedActionId
}: {
  readonly actions: readonly ApiTaskActionDetails[];
  readonly isLoading: boolean;
  readonly onSelectAction: (actionId: string) => void;
  readonly selectedActionId: string | null;
}): React.JSX.Element {
  return (
    <aside className="min-h-0 border-b border-border bg-secondary/30 p-2 md:border-b-0 md:border-r">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md bg-background px-3 py-2 text-left text-sm font-medium"
      >
        <Workflow className="size-4 text-muted-foreground" />
        <span>Actions</span>
      </button>
      <div className="mt-3 grid max-h-52 gap-1 overflow-y-auto md:max-h-none">
        {isLoading ? (
          <p className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            <span>Loading actions...</span>
          </p>
        ) : null}
        {actions.map((action) => {
          const Icon = taskActionIcons[action.iconName ?? action.id] ?? Workflow;
          return (
            <button
              key={action.id}
              type="button"
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                action.id === selectedActionId
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
              )}
              onClick={() => onSelectAction(action.id)}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{action.label}</span>
              {action.enabled ? null : (
                <span className="ml-auto rounded border border-border px-1.5 py-0.5 text-[0.65rem] uppercase text-muted-foreground">
                  Off
                </span>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ActionEditor({
  draft,
  error,
  isSaving,
  onDraftChange,
  onSave,
  preview,
  selectedAction
}: {
  readonly draft: ActionDraft | null;
  readonly error: string | null;
  readonly isSaving: boolean;
  readonly onDraftChange: (draft: ActionDraft) => void;
  readonly onSave: () => void;
  readonly preview: string;
  readonly selectedAction: ApiTaskActionDetails | null;
}): React.JSX.Element {
  if (draft == null || selectedAction == null) {
    return (
      <section className="flex min-h-72 items-center justify-center p-6 text-sm text-muted-foreground">
        Select an action.
      </section>
    );
  }

  const SelectedIcon = taskActionIcons[draft.iconName] ?? Workflow;

  return (
    <section className="grid min-h-0 gap-0 overflow-y-auto lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <div className="grid content-start gap-4 border-b border-border p-5 lg:border-b-0 lg:border-r">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <SelectedIcon className="size-5 shrink-0 text-muted-foreground" />
            <h3 className="truncate text-base font-semibold">{draft.label}</h3>
          </div>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={isSaving || !canSave(draft)}
          >
            {isSaving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            <span>Save</span>
          </Button>
        </div>
        {error == null ? null : <p className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-4">
          <Field label="Label" id="action-label">
            <Input
              id="action-label"
              value={draft.label}
              onChange={(event) =>
                onDraftChange({ ...draft, label: event.target.value })
              }
            />
          </Field>
          <Field label="Description" id="action-description">
            <Textarea
              id="action-description"
              value={draft.description}
              onChange={(event) =>
                onDraftChange({ ...draft, description: event.target.value })
              }
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Icon" id="action-icon">
              <select
                id="action-icon"
                className="h-9 w-full rounded-md border border-input bg-secondary/50 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                value={draft.iconName}
                onChange={(event) =>
                  onDraftChange({ ...draft, iconName: event.target.value })
                }
              >
                {iconOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sort order" id="action-sort-order">
              <Input
                id="action-sort-order"
                min={0}
                type="number"
                value={draft.sortOrder}
                onChange={(event) =>
                  onDraftChange({ ...draft, sortOrder: event.target.value })
                }
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                onDraftChange({ ...draft, enabled: event.target.checked })
              }
              className="size-4 rounded border border-input accent-primary"
            />
            <span>Enabled</span>
          </label>
          <WorktreeOptions draft={draft} onDraftChange={onDraftChange} />
          <Field label="Prompt template" id="action-prompt-template">
            <Textarea
              id="action-prompt-template"
              className="min-h-72 font-mono"
              value={draft.promptTemplate}
              onChange={(event) =>
                onDraftChange({ ...draft, promptTemplate: event.target.value })
              }
            />
          </Field>
        </div>
      </div>
      <div className="flex min-h-[34rem] flex-col overflow-hidden p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Check className="size-4 text-muted-foreground" />
          <span>Preview</span>
        </div>
        <MarkdownDocument
          value={preview}
          mode="view"
          onChange={() => undefined}
          className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card"
          previewClassName="px-5 py-5"
        />
      </div>
    </section>
  );
}

function WorktreeOptions({
  draft,
  onDraftChange
}: {
  readonly draft: ActionDraft;
  readonly onDraftChange: (draft: ActionDraft) => void;
}): React.JSX.Element {
  const worktree = draft.options?.worktree ?? null;

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-secondary/30 p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={worktree != null}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              options: event.target.checked
                ? {
                    worktree: {
                      default: false,
                      label: "Create worktree",
                      type: "boolean"
                    }
                  }
                : null
            })
          }
          className="size-4 rounded border border-input accent-primary"
        />
        <span>Worktree option</span>
      </label>
      {worktree == null ? null : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={worktree.default}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  options: {
                    worktree: {
                      ...worktree,
                      default: event.target.checked
                    }
                  }
                })
              }
              className="size-4 rounded border border-input accent-primary"
            />
            <span>Default on</span>
          </label>
          <Field label="Option label" id="action-worktree-label">
            <Input
              id="action-worktree-label"
              value={worktree.label}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  options: {
                    worktree: {
                      ...worktree,
                      label: event.target.value
                    }
                  }
                })
              }
            />
          </Field>
          <Field label="Default path" id="action-worktree-path">
            <Input
              id="action-worktree-path"
              value={worktree.fields?.path?.default ?? ""}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  options: {
                    worktree: {
                      ...worktree,
                      fields: {
                        path: {
                          default: event.target.value,
                          type: "text"
                        }
                      }
                    }
                  }
                })
              }
            />
          </Field>
        </>
      )}
    </section>
  );
}

function Field({
  children,
  id,
  label
}: {
  readonly children: React.ReactNode;
  readonly id: string;
  readonly label: string;
}): React.JSX.Element {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function toDraft(action: ApiTaskActionDetails): ActionDraft {
  return {
    description: action.description,
    enabled: action.enabled,
    iconName: action.iconName ?? getDefaultIconName(action.id),
    label: action.label,
    options: action.options,
    promptTemplate: action.promptTemplate,
    sortOrder: String(action.sortOrder)
  };
}

function getDefaultIconName(actionId: string): string {
  if (taskActionIcons[actionId] != null) {
    return actionId;
  }

  return "workflow";
}

function canSave(draft: ActionDraft): boolean {
  return (
    draft.description.trim().length > 0 &&
    draft.label.trim().length > 0 &&
    draft.promptTemplate.trim().length > 0 &&
    Number.isInteger(Number.parseInt(draft.sortOrder, 10)) &&
    Number.parseInt(draft.sortOrder, 10) >= 0 &&
    (draft.options?.worktree == null || draft.options.worktree.label.trim().length > 0)
  );
}
