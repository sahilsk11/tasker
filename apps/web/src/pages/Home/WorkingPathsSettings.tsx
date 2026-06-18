import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ApiWorkingDirectoryOption, WorkingPathConfig } from "@/api/tasks";
import {
  createWorkingDirectoryOption,
  deleteWorkingDirectoryOption,
  updateWorkingDirectoryOption,
  updateWorkingPathSettings
} from "@/api/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WorkingPathsSettings({
  config,
  error,
  isLoading
}: {
  readonly config: WorkingPathConfig | null;
  readonly error: string | null;
  readonly isLoading: boolean;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const [defaultWorkingDirectory, setDefaultWorkingDirectory] = useState("");
  const [defaultWorktreePath, setDefaultWorktreePath] = useState("~/wt");
  const [newLabel, setNewLabel] = useState("");
  const [newPath, setNewPath] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("0");

  useEffect(() => {
    if (config == null) {
      return;
    }

    setDefaultWorkingDirectory(config.settings.defaultWorkingDirectory ?? "");
    setDefaultWorktreePath(config.settings.defaultWorktreePath);
  }, [config]);

  const invalidateWorkingPaths = async () => {
    await queryClient.invalidateQueries({ queryKey: ["working-paths"] });
  };
  const settingsMutation = useMutation({
    mutationFn: () =>
      updateWorkingPathSettings({
        defaultWorkingDirectory: normalizeOptionalSetting(defaultWorkingDirectory),
        defaultWorktreePath: defaultWorktreePath.trim()
      }),
    onSuccess: invalidateWorkingPaths
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createWorkingDirectoryOption({
        label: newLabel.trim(),
        path: newPath.trim(),
        sortOrder: Number.parseInt(newSortOrder, 10)
      }),
    onSuccess: async () => {
      setNewLabel("");
      setNewPath("");
      setNewSortOrder("0");
      await invalidateWorkingPaths();
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({
      option,
      patch
    }: {
      readonly option: ApiWorkingDirectoryOption;
      readonly patch: {
        readonly label: string;
        readonly path: string;
        readonly sortOrder: string;
      };
    }) =>
      updateWorkingDirectoryOption(option.id, {
        label: patch.label.trim(),
        path: patch.path.trim(),
        sortOrder: Number.parseInt(patch.sortOrder, 10)
      }),
    onSuccess: invalidateWorkingPaths
  });
  const deleteMutation = useMutation({
    mutationFn: deleteWorkingDirectoryOption,
    onSuccess: invalidateWorkingPaths
  });
  const mutationError =
    settingsMutation.error instanceof Error
      ? settingsMutation.error.message
      : createMutation.error instanceof Error
        ? createMutation.error.message
        : updateMutation.error instanceof Error
          ? updateMutation.error.message
          : deleteMutation.error instanceof Error
            ? deleteMutation.error.message
            : null;
  const canSaveSettings =
    defaultWorktreePath.trim().length > 0 && !settingsMutation.isPending;
  const canCreate =
    newLabel.trim().length > 0 &&
    newPath.trim().length > 0 &&
    Number.isInteger(Number.parseInt(newSortOrder, 10)) &&
    !createMutation.isPending;

  return (
    <section className="min-h-0 overflow-y-auto p-5">
      <div className="grid max-w-5xl gap-6">
        <div className="grid gap-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h3 className="text-base font-semibold leading-6">Working paths</h3>
            {isLoading ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Loading
              </span>
            ) : null}
          </div>
          {error == null ? null : <p className="text-sm text-destructive">{error}</p>}
          {mutationError == null ? null : (
            <p className="text-sm text-destructive">{mutationError}</p>
          )}
        </div>
        <section className="grid gap-3 rounded-lg border border-border bg-secondary/20 p-4">
          <h4 className="text-sm font-semibold text-foreground">Defaults</h4>
          <div className="grid gap-3 md:grid-cols-2">
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
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              disabled={!canSaveSettings}
              onClick={() => settingsMutation.mutate()}
            >
              {settingsMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              <span>Save defaults</span>
            </Button>
          </div>
        </section>
        <section className="grid gap-3">
          <h4 className="text-sm font-semibold text-foreground">
            Saved working directories
          </h4>
          <div className="grid gap-2 rounded-lg border border-border bg-secondary/20 p-3 md:grid-cols-[1fr_2fr_6rem_auto]">
            <Input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="Label"
            />
            <Input
              value={newPath}
              onChange={(event) => setNewPath(event.target.value)}
              placeholder="/path/to/repo"
            />
            <Input
              min={0}
              type="number"
              value={newSortOrder}
              onChange={(event) => setNewSortOrder(event.target.value)}
              aria-label="Sort order"
            />
            <Button
              type="button"
              size="sm"
              disabled={!canCreate}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              <span>Add</span>
            </Button>
          </div>
          <div className="grid gap-2">
            {(config?.options ?? []).map((option) => (
              <WorkingDirectoryOptionRow
                key={option.id}
                deleteIsPending={deleteMutation.isPending}
                option={option}
                updateIsPending={updateMutation.isPending}
                onDelete={() => deleteMutation.mutate(option.id)}
                onSave={(patch) => updateMutation.mutate({ option, patch })}
              />
            ))}
            {config?.options.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                No saved working directories.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function WorkingDirectoryOptionRow({
  deleteIsPending,
  onDelete,
  onSave,
  option,
  updateIsPending
}: {
  readonly deleteIsPending: boolean;
  readonly onDelete: () => void;
  readonly onSave: (patch: {
    readonly label: string;
    readonly path: string;
    readonly sortOrder: string;
  }) => void;
  readonly option: ApiWorkingDirectoryOption;
  readonly updateIsPending: boolean;
}): React.JSX.Element {
  const [label, setLabel] = useState(option.label);
  const [path, setPath] = useState(option.path);
  const [sortOrder, setSortOrder] = useState(String(option.sortOrder));

  useEffect(() => {
    setLabel(option.label);
    setPath(option.path);
    setSortOrder(String(option.sortOrder));
  }, [option]);

  const hasChanges =
    label !== option.label ||
    path !== option.path ||
    sortOrder !== String(option.sortOrder);
  const canSave =
    hasChanges &&
    label.trim().length > 0 &&
    path.trim().length > 0 &&
    Number.isInteger(Number.parseInt(sortOrder, 10)) &&
    !updateIsPending;

  return (
    <div className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_2fr_6rem_auto_auto]">
      <Input value={label} onChange={(event) => setLabel(event.target.value)} />
      <Input value={path} onChange={(event) => setPath(event.target.value)} />
      <Input
        min={0}
        type="number"
        value={sortOrder}
        onChange={(event) => setSortOrder(event.target.value)}
        aria-label={`Sort order for ${option.label}`}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canSave}
        onClick={() => onSave({ label, path, sortOrder })}
      >
        <Save className="size-4" />
        <span>Save</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={deleteIsPending}
        onClick={onDelete}
        aria-label={`Delete ${option.label}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
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

function normalizeOptionalSetting(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
