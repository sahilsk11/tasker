import { Check, Plus } from "lucide-react";
import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLinearTaskTicket,
  createTask,
  createTaskTicket,
  getLinearOptions,
  type LinearIssueDetails,
  resolveLinearIssue
} from "@/api/tasks";
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
import { TicketFields } from "./NewTaskTicketFields";
import {
  getLinearProjectOptions,
  getMutationErrorMessage,
  getSelectedLinearTeam,
  normalizeOptionalText,
  parseTicketInput
} from "./new-task-utils";
import { workingPathsQueryOptions } from "./working-paths-query";

export function NewTaskDialog(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [ticket, setTicket] = useState("");
  const [resolvedTicket, setResolvedTicket] = useState<LinearIssueDetails | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [createTicket, setCreateTicket] = useState(false);
  const [linearTeamId, setLinearTeamId] = useState("");
  const [linearProjectId, setLinearProjectId] = useState("");
  const [linearStateId, setLinearStateId] = useState("");
  const didApplyDefaultWorkingDirectory = useRef(false);
  const queryClient = useQueryClient();
  const hasExistingTicket = ticket.trim().length > 0;
  const linearOptionsQuery = useQuery({
    enabled: createTicket,
    queryFn: getLinearOptions,
    queryKey: ["linear-options"]
  });
  const workingPathsQuery = useQuery({
    enabled: open,
    ...workingPathsQueryOptions
  });
  const linearOptions = linearOptionsQuery.data ?? null;
  const selectedLinearTeam = getSelectedLinearTeam(linearOptions, linearTeamId);
  const linearStateOptions = useMemo(
    () => selectedLinearTeam?.states ?? [],
    [selectedLinearTeam]
  );
  const linearProjectOptions = useMemo(
    () => getLinearProjectOptions(linearOptions, linearTeamId),
    [linearOptions, linearTeamId]
  );

  useEffect(() => {
    if (!hasExistingTicket) {
      setResolvedTicket(null);
      setTicketError(null);
      return;
    }

    const ticketValue = ticket.trim();
    const timeout = window.setTimeout(() => {
      void resolveLinearIssue(ticketValue)
        .then((issue) => {
          if (ticket.trim() !== ticketValue) {
            return;
          }

          setResolvedTicket(issue);
          setTicketError(null);
          setTitle(issue.title);
          setDescription(issue.description ?? "");
        })
        .catch((error: unknown) => {
          if (ticket.trim() !== ticketValue) {
            return;
          }

          setResolvedTicket(null);
          setTicketError(getMutationErrorMessage(error));
        });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [hasExistingTicket, ticket]);

  useEffect(() => {
    if (!hasExistingTicket) {
      return;
    }

    setCreateTicket(false);
    setLinearTeamId("");
    setLinearProjectId("");
    setLinearStateId("");
  }, [hasExistingTicket]);

  useEffect(() => {
    if (!createTicket || linearTeamId.length > 0) {
      return;
    }

    const firstTeam = linearOptions?.teams.at(0);
    if (firstTeam != null) {
      setLinearTeamId(firstTeam.id);
    }
  }, [createTicket, linearOptions, linearTeamId]);

  useEffect(() => {
    if (!createTicket || linearTeamId.length === 0) {
      return;
    }

    const firstState = linearStateOptions.at(0);
    if (firstState == null) {
      return;
    }

    const stateStillAvailable = linearStateOptions.some(
      (state) => state.id === linearStateId
    );
    if (!stateStillAvailable) {
      setLinearStateId(firstState.id);
    }
  }, [createTicket, linearStateId, linearStateOptions, linearTeamId]);

  useEffect(() => {
    if (!open) {
      didApplyDefaultWorkingDirectory.current = false;
      return;
    }

    if (!workingPathsQuery.isSuccess || didApplyDefaultWorkingDirectory.current) {
      return;
    }

    setWorkingDirectory(
      workingPathsQuery.data.settings.defaultWorkingDirectory ?? ""
    );
    didApplyDefaultWorkingDirectory.current = true;
  }, [open, workingPathsQuery.data, workingPathsQuery.isSuccess]);

  const mutation = useMutation({
    mutationFn: async () => {
      const task = await createTask({
        description: normalizeOptionalText(description),
        parentTaskId: null,
        title: title.trim(),
        workingDirectory: normalizeOptionalText(workingDirectory)
      });

      if (resolvedTicket != null) {
        await createTaskTicket(task.id, {
          externalId: resolvedTicket.identifier,
          url: resolvedTicket.url
        });
        return;
      }

      const ticketInput = parseTicketInput(ticket);
      if (ticketInput != null) {
        await createTaskTicket(task.id, ticketInput);
        return;
      }

      if (createTicket) {
        await createLinearTaskTicket(task.id, {
          description: normalizeOptionalText(description),
          projectId: normalizeOptionalText(linearProjectId),
          stateId: linearStateId,
          teamId: linearTeamId,
          title: title.trim()
        });
      }
    },
    onSuccess: () => {
      resetForm();
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const linearReady =
    !createTicket ||
    (linearOptions?.configured === true &&
      linearTeamId.length > 0 &&
      linearStateId.length > 0);
  const canSubmit = title.trim().length > 0 && linearReady && !mutation.isPending;
  const errorMessage = mutation.isError ? getMutationErrorMessage(mutation.error) : null;

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    await mutation.mutateAsync();
  }

  function resetForm(): void {
    setTitle("");
    setDescription("");
    setWorkingDirectory("");
    setTicket("");
    setResolvedTicket(null);
    setTicketError(null);
    setCreateTicket(false);
    setLinearTeamId("");
    setLinearProjectId("");
    setLinearStateId("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          resetForm();
        }
      }}
    >
      <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New task
      </Button>
      <DialogContent className="flex h-[min(582px,calc(100dvh-2rem))] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Create a task, optionally linked to Linear.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-5">
            <div className="grid gap-2">
              <Label htmlFor="task-ticket" className="flex items-center gap-1.5">
                Optional Linear ticket
                <span className="inline-flex size-4 items-center justify-center">
                  {resolvedTicket != null ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : null}
                </span>
              </Label>
              <Input
                id="task-ticket"
                value={ticket}
                onChange={(event) => setTicket(event.target.value)}
                placeholder="SAS-32 or https://linear.app/..."
                autoFocus
              />
              {ticketError != null ? (
                <p className="text-sm text-destructive">{ticketError}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-title">Name</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Add cursor support"
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
              <Label htmlFor="task-working-directory">Working directory</Label>
              <Input
                id="task-working-directory"
                value={workingDirectory}
                onChange={(event) => setWorkingDirectory(event.target.value)}
                placeholder="/path/to/project"
              />
              {workingPathsQuery.isError ? (
                <p className="text-sm text-destructive">
                  {getMutationErrorMessage(workingPathsQuery.error)}
                </p>
              ) : null}
            </div>
            <label
              className={
                hasExistingTicket
                  ? "flex items-center gap-2 text-sm font-medium text-muted-foreground"
                  : "flex items-center gap-2 text-sm font-medium"
              }
            >
              <input
                type="checkbox"
                className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                checked={createTicket}
                disabled={hasExistingTicket}
                onChange={(event) => setCreateTicket(event.target.checked)}
              />
              Create Linear ticket
            </label>
            {createTicket ? (
              <TicketFields
                errorMessage={
                  linearOptionsQuery.isError
                    ? getMutationErrorMessage(linearOptionsQuery.error)
                    : null
                }
                isLoading={linearOptionsQuery.isLoading}
                linearOptions={linearOptions}
                onProjectChange={setLinearProjectId}
                onStateChange={setLinearStateId}
                onTeamChange={(teamId) => {
                  setLinearTeamId(teamId);
                  setLinearProjectId("");
                  setLinearStateId("");
                }}
                projectId={linearProjectId}
                projectOptions={linearProjectOptions}
                stateId={linearStateId}
                stateOptions={linearStateOptions}
                teamId={linearTeamId}
              />
            ) : null}
            {errorMessage != null ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-border p-5">
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
