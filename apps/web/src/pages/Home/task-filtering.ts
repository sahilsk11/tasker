import type { TaskBundle, TaskState } from "@/api/tasks";
import { getPullRequestsForBundle } from "./task-resource-groups";

export type TaskFilter = "all" | "has-pr" | "has-ticket" | "root" | "subtask";

export type TaskViewOptions = {
  readonly filter: TaskFilter;
  readonly query: string;
  readonly taskAllStates: readonly TaskState[];
  readonly taskStates: readonly TaskState[];
};

type TaskSearchDocument = {
  readonly body: string;
  readonly bundle: TaskBundle;
  readonly title: string;
};

export function getVisibleTaskBundles(
  bundles: readonly TaskBundle[],
  options: TaskViewOptions
): readonly TaskBundle[] {
  const documents = bundles.map(toSearchDocument);
  const matched = documents
    .filter((document) => matchesFilter(document.bundle, options.filter))
    .filter((document) => matchesTaskState(document.bundle, options))
    .filter((document) => matchesQuery(document, options.query))
    .map((document) => document.bundle);

  return [...matched].sort((left, right) =>
    compareDate(right.task.updatedAt, left.task.updatedAt)
  );
}

function matchesTaskState(bundle: TaskBundle, options: TaskViewOptions): boolean {
  if (
    options.taskStates.length === 0 ||
    options.taskStates.length === options.taskAllStates.length
  ) {
    return true;
  }

  return options.taskStates.includes(bundle.task.state);
}

function matchesFilter(bundle: TaskBundle, filter: TaskFilter): boolean {
  switch (filter) {
    case "has-pr":
      return getPullRequestsForBundle(bundle).length > 0;
    case "has-ticket":
      return bundle.resources.tickets.length > 0;
    case "root":
      return bundle.task.parentTaskId == null;
    case "subtask":
      return bundle.task.parentTaskId != null;
    case "all":
      return true;
  }
}

function matchesQuery(document: TaskSearchDocument, query: string): boolean {
  const terms = normalizeQuery(query);
  if (terms.length === 0) {
    return true;
  }

  return terms.every(
    (term) => document.title.includes(term) || document.body.includes(term)
  );
}

function normalizeQuery(query: string): readonly string[] {
  return query
    .toLocaleLowerCase()
    .split(/\s+/u)
    .map((term) => term.trim())
    .filter(Boolean);
}

function toSearchDocument(bundle: TaskBundle): TaskSearchDocument {
  return {
    body: (bundle.task.description ?? "").toLocaleLowerCase(),
    bundle,
    title: bundle.task.title.toLocaleLowerCase()
  };
}

function compareDate(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}
