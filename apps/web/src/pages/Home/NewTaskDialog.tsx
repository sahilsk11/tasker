import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { createTask } from "@/api/tasks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hostedTasker } from "@/lib/env";
import { normalizeOptionalText } from "./new-task-utils";
import { workingPathsQueryOptions } from "./working-paths-query";

export function NewTaskDialog({
  parentTaskId,
  parentTaskTitle
}: {
  readonly parentTaskId: string | null;
  readonly parentTaskTitle: string | null;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [directory, setDirectory] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const workingPaths = useQuery({ ...workingPathsQueryOptions, enabled: open && !hostedTasker });
  const workingDirectory = directory ?? workingPaths.data?.settings.defaultWorkingDirectory ?? "";
  const createLabel = parentTaskId == null ? "Create task" : "Create subtask";
  const mutation = useMutation({
    mutationFn: () => createTask({
      description: normalizeOptionalText(description),
      parentTaskId,
      title: title.trim(),
      ...(hostedTasker ? {} : { workingDirectory: normalizeOptionalText(workingDirectory) })
    }),
    onSuccess: () => {
      close(false);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  function close(next: boolean): void {
    setOpen(next);
    if (!next) {
      setTitle("");
      setDescription("");
      setDirectory(null);
      mutation.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4" />{parentTaskId == null ? "New task" : "Create subtask"}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg gap-0">
        <DialogHeader>
          <DialogTitle>{parentTaskId == null ? "New task" : "Create subtask"}</DialogTitle>
          <DialogDescription className={parentTaskTitle == null ? "sr-only" : ""}>
            {parentTaskTitle == null ? "Add a task to Tasker." : `Under ${parentTaskTitle}`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (title.trim().length > 0 && !mutation.isPending) {
            mutation.mutate();
          }
        }}>
          <div className="grid gap-4 border-y border-border p-5">
            <div className="grid gap-2">
              <Label htmlFor="task-title">Title</Label>
              <Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-description">Description</Label>
              <Textarea id="task-description" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            {hostedTasker ? null : (
              <div className="grid gap-2">
                <Label htmlFor="task-working-directory">Working directory</Label>
                <Input id="task-working-directory" value={workingDirectory} onChange={(event) => setDirectory(event.target.value)} />
              </div>
            )}
            {mutation.error == null ? null : <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
          </div>
          <div className="flex justify-end gap-2 p-4">
            <Button type="button" variant="ghost" onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" disabled={title.trim().length === 0 || mutation.isPending}>
              {mutation.isPending ? "Creating…" : createLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
