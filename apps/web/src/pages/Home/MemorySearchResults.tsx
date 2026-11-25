import { Link } from "react-router";
import type {
  TaskMemorySearchResponse,
  TaskMemorySearchResult
} from "@/api/task-memory-search";

export function MemorySearchResults({
  data,
  error,
  isLoading,
  query
}: {
  readonly data: TaskMemorySearchResponse | undefined;
  readonly error: unknown;
  readonly isLoading: boolean;
  readonly query: string;
}): React.JSX.Element {
  if (isLoading) {
    return (
      <div role="status" className="mx-auto w-full max-w-[76rem] py-8 text-center text-sm text-muted-foreground">
        Searching tasks and saved conversations…
      </div>
    );
  }
  if (error != null) {
    return (
      <div role="alert" className="mx-auto w-full max-w-[76rem] rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error instanceof Error ? error.message : "Search failed. Try again."}
      </div>
    );
  }
  if (data == null) {
    return (
      <div role="status" className="mx-auto w-full max-w-[76rem] py-8 text-center text-sm text-muted-foreground">
        Searching…
      </div>
    );
  }
  if (data.results.length === 0) {
    return (
      <div
        className="mx-auto w-full max-w-[76rem] rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground"
        role={data.semanticStatus === "indexing" ? "status" : undefined}
      >
        {data.semanticStatus === "indexing"
          ? "Memory search is still indexing. Results will update automatically."
          : data.semanticStatus === "degraded"
            ? `No keyword matches found for “${query}”. Semantic search is temporarily unavailable.`
            : `No matches found for “${query}”.`}
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[76rem]" aria-label="Search results">
      {data.semanticStatus === "indexing" ? (
        <p role="status" className="mb-3 text-xs text-muted-foreground">
          Semantic index is updating. Results may be incomplete briefly.
        </p>
      ) : null}
      {data.semanticStatus === "degraded" ? (
        <p role="status" className="mb-3 text-xs text-amber-400">
          Semantic search is unavailable; these are keyword matches only.
        </p>
      ) : null}
      <ol className="grid gap-3">
        {data.results.map((result) => (
          <SearchResultCard key={result.sessionId ?? result.taskId} result={result} />
        ))}
      </ol>
    </section>
  );
}

function SearchResultCard({
  result
}: {
  readonly result: TaskMemorySearchResult;
}): React.JSX.Element {
  const taskContextId = result.parentTaskId ?? result.taskId;
  const taskHref = `/?parentTask=${encodeURIComponent(taskContextId)}`;
  const sourceHref = toSafeHttpUrl(result.sessionSourceUrl);
  const title = result.sessionTitle ?? result.taskTitle;
  const sourceLabel =
    result.sourceType === "task_title"
      ? "Task title"
      : result.sourceType === "session_title"
        ? "Session title"
        : formatMessageSource(result);

  return (
    <li className="rounded-xl border border-border bg-card/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {sourceLabel}
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Task: {result.taskTitle}
            {result.sessionId == null ? null : (
              <> · Session {result.sessionId.slice(0, 8)}</>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-3 text-sm">
          {sourceHref == null ? null : (
            <a
              className="text-primary underline-offset-4 hover:underline"
              href={sourceHref}
              rel="noreferrer"
              target="_blank"
            >
              Open source session
            </a>
          )}
          <Link
            className="text-primary underline-offset-4 hover:underline"
            to={taskHref}
          >
            Open task
          </Link>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
        {result.snippet}
      </p>
    </li>
  );
}

function formatMessageSource(result: TaskMemorySearchResult): string {
  const role = result.messageRole ?? "message";
  const ordinal =
    result.messageOrdinal == null ? "" : ` · Message ${String(result.messageOrdinal)}`;
  return `${role}${ordinal}`;
}

function toSafeHttpUrl(value: string | null): string | null {
  if (value == null) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
