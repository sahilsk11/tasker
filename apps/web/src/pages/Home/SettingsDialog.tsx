import {
  knownPromptPlaceholders,
  renderTaskActionTemplate,
  type KnownPromptPlaceholder,
  type TaskActionPromptContext
} from "@tasker/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  Code2,
  Eye,
  ListTree,
  LoaderCircle,
  MapIcon,
  MessageSquareText,
  Pencil,
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
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

type RenderedPromptTemplate = {
  readonly error: string | null;
  readonly value: string;
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
    actions.find((action) => action.id === selectedActionId) ?? null;
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
    setDraft(selectedAction == null ? null : toDraft(selectedAction));
  }, [selectedAction]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedActionId(null);
    }
  }, [isOpen]);

  const previewContext = useMemo<TaskActionPromptContext | null>(() => {
    if (draft == null || selectedAction == null) {
      return null;
    }

    return buildPreviewContext({
      actionId: selectedAction.id,
      label: draft.label,
      worktreeEnabled: draft.options?.worktree?.default === true
    });
  }, [draft, selectedAction]);

  const preview = useMemo(() => {
    if (draft == null || previewContext == null) {
      return "";
    }

    try {
      return renderTaskActionTemplate(draft.promptTemplate, previewContext);
    } catch (error) {
      return error instanceof Error ? error.message : "Unable to render preview.";
    }
  }, [draft, previewContext]);

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
        className="shrink-0 px-2.5"
        onClick={() => setIsOpen(true)}
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="size-4" />
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent layout="large" className="max-w-6xl grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Settings className="size-4" />
              <span className="text-xs font-medium uppercase tracking-[0.12em]">
                Settings
              </span>
            </div>
            <DialogTitle className="sr-only">Settings</DialogTitle>
            <DialogDescription className="sr-only">
              Manage action labels, prompts, icons, and options.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 border-t border-border md:grid-cols-[15rem_minmax(0,1fr)]">
            <SettingsSidebar
              isSelected={selectedActionId == null}
              onSelectActions={() => setSelectedActionId(null)}
            />
            {selectedAction == null ? (
              <ActionSettingsOverview
                actions={actions}
                error={
                  actionsQuery.error instanceof Error ? actionsQuery.error.message : null
                }
                isLoading={actionsQuery.isLoading}
                onSelectAction={setSelectedActionId}
              />
            ) : (
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
                previewContext={previewContext}
                selectedAction={selectedAction}
                onDraftChange={setDraft}
                onSave={saveSelectedAction}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SettingsSidebar({
  isSelected,
  onSelectActions
}: {
  readonly isSelected: boolean;
  readonly onSelectActions: () => void;
}): React.JSX.Element {
  return (
    <aside className="min-h-0 border-b border-border bg-secondary/30 p-2 md:border-b-0 md:border-r">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
          isSelected
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
        )}
        onClick={onSelectActions}
      >
        <Workflow className="size-4 text-muted-foreground" />
        <span>Actions</span>
      </button>
    </aside>
  );
}

function ActionSettingsOverview({
  actions,
  error,
  isLoading,
  onSelectAction
}: {
  readonly actions: readonly ApiTaskActionDetails[];
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly onSelectAction: (actionId: string) => void;
}): React.JSX.Element {
  return (
    <section className="min-h-0 overflow-y-auto p-5">
      {error == null ? null : <p className="mb-3 text-sm text-destructive">{error}</p>}
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          <span>Loading actions...</span>
        </p>
      ) : null}
      <div className="grid min-h-0 gap-2 md:grid-cols-2">
        {actions.map((action) => (
          <ActionSettingsCard
            key={action.id}
            action={action}
            onSelect={() => onSelectAction(action.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ActionEditor({
  draft,
  error,
  isSaving,
  onDraftChange,
  onSave,
  preview,
  previewContext,
  selectedAction
}: {
  readonly draft: ActionDraft | null;
  readonly error: string | null;
  readonly isSaving: boolean;
  readonly onDraftChange: (draft: ActionDraft) => void;
  readonly onSave: () => void;
  readonly preview: string;
  readonly previewContext: TaskActionPromptContext | null;
  readonly selectedAction: ApiTaskActionDetails | null;
}): React.JSX.Element {
  const [mode, setMode] = useState<"editor" | "preview">("editor");

  useEffect(() => {
    setMode("editor");
  }, [selectedAction?.id]);

  if (draft == null || selectedAction == null) {
    return (
      <section className="flex min-h-72 items-center justify-center p-6 text-sm text-muted-foreground">
        Select an action.
      </section>
    );
  }

  const SelectedIcon = taskActionIcons[draft.iconName] ?? Workflow;

  return (
    <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/20 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <SelectedIcon className="size-5 shrink-0 text-muted-foreground" />
          <h3 className="truncate text-base font-semibold leading-6">{draft.label}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMode(mode === "editor" ? "preview" : "editor")}
          >
            {mode === "editor" ? <Eye className="size-4" /> : <Pencil className="size-4" />}
            <span>{mode === "editor" ? "Preview" : "Editor"}</span>
          </Button>
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
      </div>
      <div className="min-h-0 overflow-y-auto p-5">
        {error == null ? null : <p className="mb-4 text-sm text-destructive">{error}</p>}
        {mode === "editor" ? (
          <div className="grid max-w-4xl gap-4">
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
                <NativeSelect
                  id="action-icon"
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
                </NativeSelect>
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
              <Checkbox
                checked={draft.enabled}
                onChange={(event) =>
                  onDraftChange({ ...draft, enabled: event.target.checked })
                }
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
            <TemplateReference
              previewContext={previewContext}
              selectedAction={selectedAction}
            />
          </div>
        ) : (
          <MarkdownDocument
            value={preview}
            mode="view"
            onChange={() => undefined}
            className="min-h-[32rem] overflow-hidden rounded-lg border border-border bg-card"
            previewClassName="px-5 py-5 [&_h1]:mb-3 [&_h1]:text-base [&_h1]:leading-6 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:leading-6"
          />
        )}
      </div>
    </section>
  );
}

function TemplateReference({
  previewContext,
  selectedAction
}: {
  readonly previewContext: TaskActionPromptContext | null;
  readonly selectedAction: ApiTaskActionDetails;
}): React.JSX.Element {
  const context = useMemo(
    () =>
      previewContext ??
      buildPreviewContext({
        actionId: selectedAction.id,
        label: selectedAction.label,
        worktreeEnabled: true
      }),
    [previewContext, selectedAction]
  );
  const renderedTemplates = useMemo(
    () =>
      Object.fromEntries(
        knownPromptPlaceholders.map((placeholder) => [
          placeholder,
          renderTemplatePlaceholder(placeholder, context)
        ])
      ) as Record<KnownPromptPlaceholder, RenderedPromptTemplate>,
    [context]
  );

  return (
    <section className="grid gap-2 rounded-lg border border-border bg-secondary/20 p-3">
      <div className="grid gap-1">
        <h4 className="text-sm font-medium leading-none">Template reference</h4>
        <p className="text-sm leading-6 text-muted-foreground">
          Expand a placeholder to see the rendered sample prompt text.
        </p>
      </div>
      <Accordion type="multiple" className="overflow-hidden rounded-md border border-border bg-background">
        {knownPromptPlaceholders.map((placeholder) => {
          const rendered = renderedTemplates[placeholder];
          return (
            <AccordionItem key={placeholder} value={placeholder}>
              <AccordionTrigger>
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em]">
                  {`{{${placeholder}}}`}
                </code>
              </AccordionTrigger>
              <AccordionContent>
                {rendered.error == null ? (
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-3 py-3 font-mono text-xs leading-5 text-muted-foreground">
                    {rendered.value.length === 0 ? "(empty)" : rendered.value}
                  </pre>
                ) : (
                  <p className="px-3 py-3 text-sm text-destructive">{rendered.error}</p>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
}

function ActionSettingsCard({
  action,
  onSelect
}: {
  readonly action: ApiTaskActionDetails;
  readonly onSelect: () => void;
}): React.JSX.Element {
  const Icon = taskActionIcons[action.iconName ?? action.id] ?? Workflow;

  return (
    <button
      type="button"
      className={cn(
        "grid min-w-0 gap-2 rounded-lg border border-border p-3 text-left",
        "transition-colors hover:bg-secondary/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
      onClick={onSelect}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{action.label}</span>
        {action.enabled ? null : (
          <span className="ml-auto rounded border border-border px-1.5 py-0.5 text-[0.65rem] uppercase text-muted-foreground">
            Off
          </span>
        )}
      </div>
      <p className="text-sm leading-5 text-muted-foreground">{action.description}</p>
    </button>
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
        <Checkbox
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
        />
        <span>Worktree option</span>
      </label>
      {worktree == null ? null : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
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

function buildPreviewContext({
  actionId,
  label,
  worktreeEnabled
}: {
  readonly actionId: string;
  readonly label: string;
  readonly worktreeEnabled: boolean;
}): TaskActionPromptContext {
  return {
    action: {
      id: actionId,
      label
    },
    apiBaseUrl: "http://127.0.0.1:3000",
    sessionId: "preview-session",
    taskDescription: "Preview task description.",
    taskId: "preview-task",
    taskTitle: "Example task",
    ...(worktreeEnabled
      ? { worktree: { enabled: true, path: "~/wt/tasker-preview" } }
      : {})
  };
}

function renderTemplatePlaceholder(
  placeholder: KnownPromptPlaceholder,
  context: TaskActionPromptContext
): RenderedPromptTemplate {
  try {
    return {
      error: null,
      value: renderTaskActionTemplate(`{{${placeholder}}}`, {
        ...context,
        ...(placeholder === "worktree"
          ? { worktree: { enabled: true, path: context.worktree?.path ?? "~/wt/tasker-preview" } }
          : {})
      })
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to render template.",
      value: ""
    };
  }
}
