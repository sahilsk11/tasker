import {
  agentPromptProviders,
  defaultAgentPromptProvider,
  type AgentPromptProvider
} from "@tasker/core";
import {
  ArrowLeft,
  Check,
  Copy,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Play,
  Save,
  Workflow
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ApiSession, ApiTaskAction, TaskActionPromptValues } from "@/api/tasks";
import { renderTaskSessionPrompt, runTaskSessionPrompt } from "@/api/tasks";
import { MarkdownDocument } from "@/components/MarkdownDocument";
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
import { cn } from "@/lib/utils";
import {
  defaultPreviewOptionValue,
  humanizeOptionId,
  mergePreviewOptionValues,
  optionEntriesFor,
  type PreviewOptionValues
} from "./action-options-utils";
import { taskActionIcons } from "./task-action-icons";

const railActionCount = 3;
const rowActionCount = 2;

export function TaskActionRow({
  actions,
  isPreparingPrompt = false,
  layout = "row",
  onSelectAction,
  onViewAll,
  preparingActionId = null
}: {
  readonly actions: readonly ApiTaskAction[];
  readonly isPreparingPrompt?: boolean;
  readonly layout?: "rail" | "row";
  readonly onSelectAction: (action: ApiTaskAction) => void;
  readonly onViewAll: () => void;
  readonly preparingActionId?: string | null;
}): React.JSX.Element {
  const isRail = layout === "rail";
  const quickActions = actions
    .filter((action) => action.isRecommended)
    .slice(0, isRail ? railActionCount : rowActionCount);

  return (
    <div
      className={cn(
        "min-w-0",
        isRail ? "grid gap-3" : "mt-auto border-t border-border/70 pt-4"
      )}
    >
      <div className={cn(isRail ? "grid gap-2" : "flex flex-wrap justify-center gap-2")}>
        {quickActions.map((action, index) => (
          <TaskActionButton
            key={action.id}
            action={action}
            disabled={isPreparingPrompt}
            emphasized={index === 0}
            isPreparing={preparingActionId === action.id}
            layout={layout}
            onSelect={() => onSelectAction(action)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "min-w-0",
            isRail
              ? "h-8 w-full justify-center rounded-[9px] border-[#232429] bg-transparent px-2.5 py-0 text-sm text-[#c2c4ca] hover:border-[#2e2f36] hover:bg-[#1a1b21]"
              : "h-8 w-36 px-3"
          )}
          disabled={isPreparingPrompt}
          onClick={onViewAll}
        >
          {isRail ? null : <MoreHorizontal className="size-4" />}
          <span>{isRail ? "All actions" : "View all"}</span>
        </Button>
      </div>
    </div>
  );
}

export function TaskActionsDialog({
  actions,
  error,
  isPreparingPrompt,
  onOpenChange,
  onSelectAction,
  open,
  taskTitle
}: {
  readonly actions: readonly ApiTaskAction[];
  readonly error: string | null;
  readonly isPreparingPrompt: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly onSelectAction: (action: ApiTaskAction) => void;
  readonly open: boolean;
  readonly taskTitle: string;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Workflow className="size-4" />
            <span className="text-xs font-medium uppercase tracking-[0.12em]">
              Actions
            </span>
          </div>
          <DialogTitle>Task actions</DialogTitle>
          <DialogDescription>
            Suggested prompts for {taskTitle}.
          </DialogDescription>
          <TaskActionDialogStatus error={error} isPreparingPrompt={isPreparingPrompt} />
        </DialogHeader>
        <div className="grid min-h-0 gap-2 overflow-y-auto border-t border-border p-5 md:grid-cols-2">
          {actions.map((action) => (
            <TaskActionListItem
              key={action.id}
              action={action}
              disabled={isPreparingPrompt}
              onSelect={() => onSelectAction(action)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TaskActionPromptDialog({
  action,
  defaultWorkingPath,
  onBack,
  onRunComplete,
  onOpenChange,
  session,
  taskId
}: {
  readonly action: ApiTaskAction | null;
  readonly defaultWorkingPath: string;
  readonly onBack: () => void;
  readonly onRunComplete: (session: ApiSession) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly session: ApiSession | null;
  readonly taskId: string;
}): React.JSX.Element {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const [markdownMode, setMarkdownMode] = useState<"edit" | "view">("view");
  const [optionValues, setOptionValues] = useState<PreviewOptionValues>({});
  const [promptDraft, setPromptDraft] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AgentPromptProvider>(
    defaultAgentPromptProvider
  );
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [workingPath, setWorkingPath] = useState("");
  const optionEntries = optionEntriesFor(action?.options ?? null);

  useEffect(() => {
    setCopiedPrompt(false);
    setRunError(null);
  }, [action, optionValues, promptDraft, selectedProvider, session, workingPath]);

  useEffect(() => {
    if (action == null || session == null) {
      setPromptDraft("");
      return;
    }

    setMarkdownMode("view");
    setOptionValues((currentValues) =>
      mergePreviewOptionValues(action.options, currentValues)
    );
    setPromptError(null);
    setRunError(null);
    setSelectedProvider(defaultAgentPromptProvider);
    setWorkingPath(defaultWorkingPath);
  }, [action, defaultWorkingPath, session]);

  useEffect(() => {
    setOptionValues((currentValues) =>
      mergePreviewOptionValues(action?.options ?? null, currentValues)
    );
  }, [action?.options]);

  useEffect(() => {
    if (action == null || session == null) {
      return;
    }

    let cancelled = false;
    setIsLoadingPrompt(true);
    setPromptError(null);

    const promptOptions = buildPromptOptions({
      optionValues,
      workingPath,
      action
    });

    void renderTaskSessionPrompt(taskId, session.id, {
      promptOptions,
      provider: selectedProvider
    })
      .then((prompt) => {
        if (!cancelled) {
          setPromptDraft(prompt);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPromptError(
            error instanceof Error ? error.message : "Failed to load action prompt."
          );
          setPromptDraft("");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPrompt(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [action, optionValues, selectedProvider, session, taskId, workingPath]);

  async function copyPrompt(): Promise<void> {
    if (promptDraft.length === 0 || workingPath.trim().length === 0) {
      return;
    }

    await copyPlainText(promptDraft);
    setCopiedPrompt(true);
  }

  async function runInAgent(): Promise<void> {
    const trimmedWorkingPath = workingPath.trim();
    if (session == null || promptDraft.trim().length === 0 || trimmedWorkingPath.length === 0) {
      return;
    }

    setIsRunningAgent(true);
    setRunError(null);
    try {
      const result = await runTaskSessionPrompt(taskId, session.id, {
        prompt: promptDraft,
        provider: selectedProvider,
        workingPath: trimmedWorkingPath
      });
      onRunComplete(result.session);
      onOpenChange(false);
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : "Failed to run prompt in agent."
      );
    } finally {
      setIsRunningAgent(false);
    }
  }

  const Icon =
    action == null
      ? Workflow
      : taskActionIcons[action.iconName ?? action.id] ?? Workflow;
  const hasWorkingPath = workingPath.trim().length > 0;
  const canRunPrompt =
    promptDraft.trim().length > 0 && hasWorkingPath && !isLoadingPrompt && !isRunningAgent;

  return (
    <Dialog open={action != null && session != null} onOpenChange={onOpenChange}>
      <DialogContent
        layout="standard"
        className="max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute left-4 top-4 z-10"
          onClick={onBack}
          aria-label="Back to task actions"
          title="Back to task actions"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <DialogHeader className="gap-3 p-5 pb-5 pl-12 pr-12 pt-14">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <DialogTitle>{action?.label ?? "Action prompt"}</DialogTitle>
          </div>
          <DialogDescription className="mt-1">{action?.description}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto border-t border-border p-5">
          {optionEntries.length === 0 ? null : (
            <section className="grid gap-3 rounded-lg border border-border bg-secondary/30 p-4">
              {optionEntries.map(([optionId, option]) => {
                const value = optionValues[optionId] ?? defaultPreviewOptionValue(option);
                const fieldEntries = Object.entries(option.fields ?? {});
                return (
                  <div key={optionId} className="grid gap-3">
                    <label className="flex min-w-0 items-center gap-3 text-sm font-medium text-foreground">
                      <Checkbox
                        checked={value.enabled}
                        onChange={(event) =>
                          setOptionValues({
                            ...optionValues,
                            [optionId]: {
                              ...value,
                              enabled: event.target.checked
                            }
                          })
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                    {!value.enabled || fieldEntries.length === 0 ? null : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {fieldEntries.map(([fieldId, field]) => (
                          <div key={fieldId} className="grid gap-2">
                            <Label htmlFor={`action-option-${optionId}-${fieldId}`}>
                              {field.label ?? humanizeOptionId(fieldId)}
                            </Label>
                            <Input
                              id={`action-option-${optionId}-${fieldId}`}
                              value={value.fields[fieldId] ?? field.default}
                              placeholder={field.default}
                              onChange={(event) =>
                                setOptionValues({
                                  ...optionValues,
                                  [optionId]: {
                                    ...value,
                                    fields: {
                                      ...value.fields,
                                      [fieldId]: event.target.value
                                    }
                                  }
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          <section className="grid gap-2">
            <Label htmlFor="action-working-path">Working path</Label>
            <Input
              id="action-working-path"
              value={workingPath}
              placeholder="/path/to/project"
              onChange={(event) => setWorkingPath(event.target.value)}
            />
          </section>

          <section className="flex h-[min(30rem,calc(100dvh-18rem))] min-h-80 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-sm font-medium text-foreground">Prompt preview</span>
              <div className="flex items-center gap-2">
                <Label className="sr-only" htmlFor="action-agent-provider">
                  Agent provider
                </Label>
                <NativeSelect
                  id="action-agent-provider"
                  className="h-8 w-36 bg-background px-2.5 pr-8"
                  value={selectedProvider}
                  onChange={(event) =>
                    setSelectedProvider(event.target.value as AgentPromptProvider)
                  }
                  disabled={isLoadingPrompt || isRunningAgent}
                  aria-label="Agent provider"
                >
                  {agentPromptProviders.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </NativeSelect>
                {markdownMode === "view" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setMarkdownMode("edit")}
                    disabled={isLoadingPrompt}
                  >
                    <Pencil className="size-4" />
                    <span>Edit</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => setMarkdownMode("view")}
                  >
                    <Save className="size-4" />
                    <span>Save</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyPrompt()}
                  disabled={promptDraft.length === 0 || !hasWorkingPath || isLoadingPrompt}
                >
                  {copiedPrompt ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  <span>{copiedPrompt ? "Copied" : "Copy"}</span>
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => void runInAgent()}
                  disabled={!canRunPrompt}
                >
                  {isRunningAgent ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  <span>{isRunningAgent ? "Running" : "Run in Agent"}</span>
                </Button>
              </div>
            </div>
            {promptError != null ? (
              <p className="px-5 py-4 text-sm text-destructive">{promptError}</p>
            ) : isLoadingPrompt ? (
              <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                <span>Loading prompt...</span>
              </p>
            ) : (
              <MarkdownDocument
                value={promptDraft}
                onChange={setPromptDraft}
                mode={markdownMode}
                className="flex min-h-0 flex-1"
                previewClassName="px-5 py-5"
                textareaClassName="min-h-0"
              />
            )}
          </section>
          {runError == null ? null : (
            <p className="text-sm text-destructive" role="alert">
              {runError}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildPromptOptions({
  action,
  optionValues,
  workingPath,
}: {
  readonly action: ApiTaskAction | null;
  readonly optionValues: PreviewOptionValues;
  readonly workingPath: string;
}): TaskActionPromptValues {
  const options = Object.fromEntries(
    optionEntriesFor(action?.options ?? null).map(([optionId, option]) => {
      const value = optionValues[optionId] ?? defaultPreviewOptionValue(option);
      return [
        optionId,
        {
          enabled: value.enabled,
          ...(Object.keys(value.fields).length === 0 ? {} : { fields: value.fields })
        }
      ];
    })
  );

  return {
    ...(Object.keys(options).length === 0 ? {} : { options }),
    ...(workingPath.trim().length === 0 ? {} : { workingPath: workingPath.trim() })
  };
}

async function copyPlainText(value: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([value], { type: "text/plain" })
      })
    ]);
    return;
  }

  await navigator.clipboard.writeText(value);
}

function TaskActionButton({
  action,
  disabled,
  emphasized,
  isPreparing,
  layout,
  onSelect
}: {
  readonly action: ApiTaskAction;
  readonly disabled: boolean;
  readonly emphasized: boolean;
  readonly isPreparing: boolean;
  readonly layout: "rail" | "row";
  readonly onSelect: () => void;
}): React.JSX.Element {
  const isRail = layout === "rail";
  const Icon = taskActionIcons[action.iconName ?? action.id] ?? Workflow;

  return (
    <Button
      type="button"
      variant={isRail && !emphasized ? "outline" : "default"}
      size="sm"
      className={cn(
        "min-w-0",
        isRail && emphasized
          ? "h-8 w-full justify-center rounded-[9px] px-2.5 py-0 text-sm"
          : isRail
            ? "h-8 w-full justify-center rounded-[9px] border-[#232429] bg-transparent px-2.5 py-0 text-sm text-[#c2c4ca] hover:border-[#2e2f36] hover:bg-[#1a1b21]"
            : "h-8 w-36 px-3"
      )}
      disabled={disabled}
      onClick={onSelect}
    >
      {isPreparing ? (
        <LoaderCircle className="size-4 shrink-0 animate-spin" />
      ) : (
        <Icon className="size-4 shrink-0" />
      )}
      <span className="min-w-0 truncate">{action.label}</span>
    </Button>
  );
}

function TaskActionDialogStatus({
  error,
  isPreparingPrompt
}: {
  readonly error: string | null;
  readonly isPreparingPrompt: boolean;
}): React.JSX.Element | null {
  if (error != null) {
    return (
      <p className="flex min-w-0 items-center gap-2 text-sm leading-6 text-destructive">
        {error}
      </p>
    );
  }

  if (!isPreparingPrompt) {
    return null;
  }

  return (
    <p
      className="flex min-w-0 items-center gap-2 text-sm leading-6 text-muted-foreground"
      aria-live="polite"
    >
      <LoaderCircle className="size-4 shrink-0 animate-spin" />
      <span>Preparing prompt...</span>
    </p>
  );
}

function TaskActionListItem({
  action,
  disabled,
  onSelect
}: {
  readonly action: ApiTaskAction;
  readonly disabled: boolean;
  readonly onSelect: () => void;
}): React.JSX.Element {
  const Icon = taskActionIcons[action.iconName ?? action.id] ?? Workflow;

  return (
    <button
      type="button"
      className={cn(
        "grid min-w-0 gap-2 rounded-lg border border-border p-3 text-left",
        "transition-colors hover:bg-secondary/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-transparent"
      )}
      disabled={disabled}
      onClick={onSelect}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{action.label}</span>
      </div>
      <p className="text-sm leading-5 text-muted-foreground">{action.description}</p>
    </button>
  );
}
