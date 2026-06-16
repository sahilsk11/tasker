import type { LinearIssueStatus, TaskBundle } from "@/api/tasks";

export type TaskFilter = "all" | "has-pr" | "has-ticket" | "root" | "subtask";

export type TaskSort = "created-asc" | "created-desc" | "title-asc" | "updated-desc";

export type TaskViewOptions = {
  readonly filter: TaskFilter;
  readonly linearAllStateIds: readonly string[];
  readonly linearIssueStatuses: readonly LinearIssueStatus[];
  readonly linearStateIds: readonly string[];
  readonly query: string;
  readonly sort: TaskSort;
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
    .filter((document) => matchesLinearStatus(document.bundle, options))
    .filter((document) => matchesQuery(document, options.query))
    .map((document) => document.bundle);

  return [...matched].sort(getTaskComparator(options.sort));
}

function matchesLinearStatus(bundle: TaskBundle, options: TaskViewOptions): boolean {
  if (
    options.linearStateIds.length === 0 ||
    options.linearStateIds.length === options.linearAllStateIds.length
  ) {
    return true;
  }

  const selectedStateIds = new Set(options.linearStateIds);
  const statusByIdentifier = new Map(
    options.linearIssueStatuses.map((issue) => [issue.identifier, issue])
  );

  return bundle.resources.tickets.some((ticket) => {
    const issue = statusByIdentifier.get(ticket.externalId.toUpperCase());
    return issue == null ? false : selectedStateIds.has(issue.state.id);
  });
}

function matchesFilter(bundle: TaskBundle, filter: TaskFilter): boolean {
  switch (filter) {
    case "has-pr":
      return bundle.resources.pullRequests.length > 0;
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

function getTaskComparator(sort: TaskSort): (left: TaskBundle, right: TaskBundle) => number {
  switch (sort) {
    case "created-asc":
      return (left, right) => compareDate(left.task.createdAt, right.task.createdAt);
    case "created-desc":
      return (left, right) => compareDate(right.task.createdAt, left.task.createdAt);
    case "title-asc":
      return (left, right) => left.task.title.localeCompare(right.task.title);
    case "updated-desc":
      return (left, right) => compareDate(right.task.updatedAt, left.task.updatedAt);
  }
}

function compareDate(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}
