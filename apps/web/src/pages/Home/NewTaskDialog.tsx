import { Plus } from "lucide-react";
import { type SyntheticEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLinearTaskTicket,
  createTask,
  createTaskTicket,
  getLinearOptions
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

export function NewTaskDialog(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ticket, setTicket] = useState("");
  const [createInLinear, setCreateInLinear] = useState(false);
  const [linearTeamId, setLinearTeamId] = useState("");
  const [linearProjectId, setLinearProjectId] = useState("");
  const [linearStateId, setLinearStateId] = useState("");
  const queryClient = useQueryClient();
  const linearOptionsQuery = useQuery({
    enabled: createInLinear,
    queryFn: getLinearOptions,
    queryKey: ["linear-options"]
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
    if (!createInLinear || linearTeamId.length > 0) {
      return;
    }

    const firstTeam = linearOptions?.teams.at(0);
    if (firstTeam == null) {
      return;
    }

    setLinearTeamId(firstTeam.id);
  }, [createInLinear, linearOptions, linearTeamId]);

  useEffect(() => {
    if (!createInLinear || linearTeamId.length === 0) {
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
  }, [createInLinear, linearStateId, linearStateOptions, linearTeamId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const task = await createTask({
        description: normalizeOptionalText(description),
        parentTaskId: null,
        title: title.trim()
      });

      if (createInLinear) {
        await createLinearTaskTicket(task.id, {
          description: normalizeOptionalText(description),
          projectId: normalizeOptionalText(linearProjectId),
          stateId: linearStateId,
          teamId: linearTeamId,
          title: title.trim()
        });
        return;
      }

      const ticketInput = parseTicketInput(ticket);
      if (ticketInput != null) {
        await createTaskTicket(task.id, ticketInput);
      }
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setTicket("");
      setCreateInLinear(false);
      setLinearTeamId("");
      setLinearProjectId("");
      setLinearStateId("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const linearReady =
    !createInLinear ||
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New task
      </Button>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Create the task now. Ticket linkage is optional and can be filled in later.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col overflow-hidden border-t border-border"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5">
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
            <TicketFields
              createInLinear={createInLinear}
              errorMessage={
                linearOptionsQuery.isError
                  ? getMutationErrorMessage(linearOptionsQuery.error)
                  : null
              }
              isLoading={linearOptionsQuery.isLoading}
              linearOptions={linearOptions}
              onCreateInLinearChange={(isChecked) => {
                setCreateInLinear(isChecked);
                if (isChecked) {
                  setTicket("");
                } else {
                  setLinearTeamId("");
                  setLinearProjectId("");
                  setLinearStateId("");
                }
              }}
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
              ticket={ticket}
              onTicketChange={setTicket}
            />
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
