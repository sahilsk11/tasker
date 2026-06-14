import { useQuery } from "@tanstack/react-query";
import { listTaskBundles } from "@/api/tasks";
import { NewTaskDialog } from "./NewTaskDialog";
import { TaskGrid, TaskGridSkeleton } from "./TaskGrid";

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

function LoadError({ error }: { readonly error: unknown }): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[76rem] rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error instanceof Error ? error.message : "Failed to load tasks."}
    </div>
  );
}
