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
  FolderGit2,
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
  ApiWorkingPathSettings,
  ApiTaskActionDetails,
  ApiTaskActionOptions,
  TaskState,
  TaskStateDefinition,
  UpdateTaskActionInput
} from "@/api/tasks";
import {
  getWorkingPaths,
  listTaskStates,
  listTaskActionSettings,
  updateTaskActionSettings,
  updateWorkingPathSettings
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
import {
  ActionOptionsEditor,
  ActionOptionsPreview
} from "./ActionOptionsEditor";
import {
  areOptionsValid,
  defaultPreviewOptionValue,
  mergePreviewOptionValues,
  optionEntriesFor,
  renderOptionPromptText,
  type PreviewOptionValues
} from "./action-options-utils";
import { taskActionIcons } from "./task-action-icons";
import type { LucideIcon } from "lucide-react";

type ActionDraft = {
  readonly description: string;
  readonly enabled: boolean;
  readonly iconName: string;
  readonly label: string;
  readonly options: ApiTaskActionOptions | null;
  readonly promptTemplate: string;
  readonly recommendationStates: readonly TaskState[];
  readonly sortOrder: string;
};

type RenderedPromptTemplate = {
  readonly error: string | null;
  readonly value: string;
};

type SettingsSection = "working-paths" | "actions";

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
  const [selectedSection, setSelectedSection] =
    useState<SettingsSection>("working-paths");
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const queryClient = useQueryClient();
  const actionsQuery = useQuery({
    enabled: isOpen,
    queryFn: listTaskActionSettings,
    queryKey: ["action-settings"]
  });
  const workingPathsQuery = useQuery({
    enabled: isOpen,
    queryFn: getWorkingPaths,
    queryKey: ["working-paths"]
  });
  const taskStatesQuery = useQuery({
    enabled: isOpen,
    queryFn: listTaskStates,
    queryKey: ["task-states"]
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
      setSelectedSection("working-paths");
      setSelectedActionId(null);
    }
  }, [isOpen]);

  const previewContext = useMemo<TaskActionPromptContext | null>(() => {
    if (draft == null || selectedAction == null) {
      return null;
    }

    return buildPreviewContext({
      actionId: selectedAction.id,
      label: draft.label
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
        recommendationStates: draft.recommendationStates,
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
              selectedSection={selectedSection}
              onSelectActions={() => {
                setSelectedSection("actions");
                setSelectedActionId(null);
              }}
              onSelectWorkingPaths={() => {
                setSelectedSection("working-paths");
                setSelectedActionId(null);
              }}
            />
            {selectedSection === "working-paths" ? (
              <WorkingPathsSettings
                error={
                  workingPathsQuery.error instanceof Error
                    ? workingPathsQuery.error.message
                    : null
                }
                isLoading={workingPathsQuery.isLoading}
                settings={workingPathsQuery.data?.settings ?? null}
              />
            ) : selectedAction == null ? (
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
                taskStateDefinitions={taskStatesQuery.data ?? []}
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
  onSelectActions,
  onSelectWorkingPaths,
  selectedSection
}: {
  readonly onSelectActions: () => void;
  readonly onSelectWorkingPaths: () => void;
  readonly selectedSection: SettingsSection;
}): React.JSX.Element {
  return (
    <aside className="grid min-h-0 content-start gap-1 border-b border-border bg-secondary/30 p-2 md:border-b-0 md:border-r">
      <SettingsNavButton
        Icon={FolderGit2}
        isSelected={selectedSection === "working-paths"}
        label="Working paths"
        onClick={onSelectWorkingPaths}
      />
      <SettingsNavButton
        Icon={Workflow}
        isSelected={selectedSection === "actions"}
        label="Actions"
        onClick={onSelectActions}
      />
    </aside>
  );
}

function SettingsNavButton({
  Icon,
  isSelected,
  label,
  onClick
}: {
  readonly Icon: LucideIcon;
  readonly isSelected: boolean;
  readonly label: string;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
        isSelected
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
      )}
      onClick={onClick}
    >
      <Icon className="size-4 text-muted-foreground" />
      <span>{label}</span>
    </button>
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

function WorkingPathsSettings({
  error,
  isLoading,
  settings
}: {
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly settings: ApiWorkingPathSettings | null;
}): React.JSX.Element {
  const [defaultWorkingDirectory, setDefaultWorkingDirectory] = useState("");
  const [defaultWorktreePath, setDefaultWorktreePath] = useState("~/wt");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      updateWorkingPathSettings({
        defaultWorkingDirectory:
          defaultWorkingDirectory.trim().length === 0
            ? null
            : defaultWorkingDirectory.trim(),
        defaultWorktreePath: defaultWorktreePath.trim()
      }),
    onSuccess: async (updatedSettings) => {
      setDefaultWorkingDirectory(updatedSettings.defaultWorkingDirectory ?? "");
      setDefaultWorktreePath(updatedSettings.defaultWorktreePath);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["working-paths"] })
      ]);
    }
  });

  useEffect(() => {
    if (settings == null || mutation.isPending) {
      return;
    }

    setDefaultWorkingDirectory(settings.defaultWorkingDirectory ?? "");
    setDefaultWorktreePath(settings.defaultWorktreePath);
  }, [mutation.isPending, settings]);

  const mutationError =
    mutation.error instanceof Error ? mutation.error.message : null;

  return (
    <section className="min-h-0 overflow-y-auto p-5">
      <div className="grid max-w-3xl gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Working paths</h3>
          {isLoading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading
            </span>
          ) : null}
        </div>
        <div className="grid gap-3 rounded-lg border border-border bg-secondary/20 p-4">
          <Field label="Default working directory" id="default-working-directory">
            <Input
              id="default-working-directory"
              value={defaultWorkingDirectory}
              onChange={(event) => setDefaultWorkingDirectory(event.target.value)}
              placeholder="/path/to/project"
            />
          </Field>
          <Field label="Default worktree path" id="default-worktree-path">
            <Input
              id="default-worktree-path"
              value={defaultWorktreePath}
              onChange={(event) => setDefaultWorktreePath(event.target.value)}
              placeholder="~/wt"
            />
          </Field>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || defaultWorktreePath.trim().length === 0}
            >
              {mutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              <span>Save</span>
            </Button>
          </div>
        </div>
        {error == null ? null : <p className="text-sm text-destructive">{error}</p>}
        {mutationError == null ? null : (
          <p className="text-sm text-destructive">{mutationError}</p>
        )}
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
  preview: fallbackPreview,
  previewContext,
  selectedAction,
  taskStateDefinitions
}: {
  readonly draft: ActionDraft | null;
  readonly error: string | null;
  readonly isSaving: boolean;
  readonly onDraftChange: (draft: ActionDraft) => void;
  readonly onSave: () => void;
  readonly preview: string;
  readonly previewContext: TaskActionPromptContext | null;
  readonly selectedAction: ApiTaskActionDetails | null;
  readonly taskStateDefinitions: readonly TaskStateDefinition[];
}): React.JSX.Element {
  const [mode, setMode] = useState<"editor" | "preview">("editor");
  const [previewOptionValues, setPreviewOptionValues] = useState<PreviewOptionValues>(
    {}
  );

  useEffect(() => {
    setMode("editor");
  }, [selectedAction?.id]);

  useEffect(() => {
    setPreviewOptionValues((currentValues) =>
      mergePreviewOptionValues(draft?.options ?? null, currentValues)
    );
  }, [draft?.options]);

  const previewContextWithOptions = useMemo(() => {
    if (draft == null || previewContext == null) {
      return null;
    }

    const optionsText = optionEntriesFor(draft.options)
      .map(([optionId, option]) =>
        renderOptionPromptText(
          option,
          previewOptionValues[optionId] ?? defaultPreviewOptionValue(option)
        )
      )
      .filter((section) => section.trim().length > 0)
      .join("\n\n");

    return {
      ...previewContext,
      optionsText
    } satisfies TaskActionPromptContext;
  }, [draft, previewContext, previewOptionValues]);
  const preview = useMemo(() => {
    if (draft == null || previewContextWithOptions == null) {
      return fallbackPreview;
    }

    try {
      return renderTaskActionTemplate(draft.promptTemplate, previewContextWithOptions);
    } catch (error) {
      return error instanceof Error ? error.message : "Unable to render preview.";
    }
  }, [draft, fallbackPreview, previewContextWithOptions]);

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
            <RecommendationStateEditor
              draft={draft}
              stateDefinitions={taskStateDefinitions}
              onDraftChange={onDraftChange}
            />
            <ActionOptionsEditor draft={draft} onDraftChange={onDraftChange} />
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
          <div className="grid gap-4">
            <ActionOptionsPreview
              options={draft.options}
              values={previewOptionValues}
              onValuesChange={setPreviewOptionValues}
            />
            <MarkdownDocument
              value={preview}
              mode="view"
              onChange={() => undefined}
              className="min-h-[32rem] overflow-hidden rounded-lg border border-border bg-card"
              previewClassName="px-5 py-5 [&_h1]:mb-3 [&_h1]:text-base [&_h1]:leading-6 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:leading-6"
            />
          </div>
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
        label: selectedAction.label
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

function RecommendationStateEditor({
  draft,
  onDraftChange,
  stateDefinitions
}: {
  readonly draft: ActionDraft;
  readonly onDraftChange: (draft: ActionDraft) => void;
  readonly stateDefinitions: readonly TaskStateDefinition[];
}): React.JSX.Element {
  function toggleState(state: TaskState, checked: boolean): void {
    const nextStates = checked
      ? [...draft.recommendationStates, state]
      : draft.recommendationStates.filter((currentState) => currentState !== state);
    onDraftChange({ ...draft, recommendationStates: nextStates });
  }

  return (
    <section className="grid gap-2">
      <Label>Recommend this action when state is</Label>
      <div className="flex flex-wrap gap-2">
        {stateDefinitions.map((state) => (
          <label
            key={state.value}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <Checkbox
              checked={draft.recommendationStates.includes(state.value)}
              onChange={(event) => toggleState(state.value, event.target.checked)}
            />
            <span>{state.label}</span>
          </label>
        ))}
      </div>
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
    recommendationStates: action.recommendationStates,
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
    areOptionsValid(draft.options)
  );
}

function buildPreviewContext({
  actionId,
  label
}: {
  readonly actionId: string;
  readonly label: string;
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
    taskTitle: "Example task"
  };
}

function renderTemplatePlaceholder(
  placeholder: KnownPromptPlaceholder,
  context: TaskActionPromptContext
): RenderedPromptTemplate {
  try {
    return {
      error: null,
      value: renderTaskActionTemplate(`{{${placeholder}}}`, context)
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to render template.",
      value: ""
    };
  }
}
