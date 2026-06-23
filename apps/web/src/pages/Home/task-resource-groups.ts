import type { ApiArtifact, ApiPullRequest, TaskBundle } from "@/api/tasks";

export type ResourceKind =
  | "ticket"
  | "session"
  | "artifact"
  | "worktree"
  | "pr"
  | "subtask";

export type Resource = {
  readonly archivedAt: string | null;
  readonly detail: string;
  readonly href: string | null;
  readonly id: string;
  readonly key: string;
  readonly kind: ResourceKind;
  readonly label: string;
  readonly metaLabel: string | null;
  readonly pullRequestNumber: number | null;
  readonly pullRequestRepository: string | null;
  readonly sortAt: string;
  readonly state: string;
  readonly taskId: string;
  readonly updatedAt: string;
};

export type ResourceGroupView = {
  readonly items: readonly Resource[];
  readonly kind: ResourceKind;
};

const resourceOrder: readonly ResourceKind[] = [
  "ticket",
  "session",
  "artifact",
  "worktree",
  "pr",
  "subtask"
];

export function getResourceGroupsForBundle(
  bundle: TaskBundle
): readonly ResourceGroupView[] {
  return groupResources(getResourcesForBundle(bundle));
}

export function getResourceGroupForArtifacts(
  artifacts: readonly ApiArtifact[]
): ResourceGroupView {
  return {
    items: artifacts.map(resourceFromArtifact),
    kind: "artifact"
  };
}

export function getTimelineResourcesForBundle(bundle: TaskBundle): readonly Resource[] {
  return [...getResourcesForBundle(bundle)].sort((left, right) => {
    const rightTime = new Date(right.sortAt).getTime();
    const leftTime = new Date(left.sortAt).getTime();

    return getSortableTime(rightTime) - getSortableTime(leftTime);
  });
}

export function getLatestResourceActivityAt(bundle: TaskBundle): string | null {
  const resources = getResourcesForBundle(bundle);
  const latest = resources.reduce<Resource | null>((currentLatest, resource) => {
    if (currentLatest == null) {
      return resource;
    }

    return compareResourceActivity(resource, currentLatest) > 0
      ? resource
      : currentLatest;
  }, null);

  return latest?.sortAt ?? null;
}

export function getPullRequestsForBundle(
  bundle: TaskBundle
): readonly ApiPullRequest[] {
  const resources = bundle.resources as Omit<TaskBundle["resources"], "pullRequests"> & {
    readonly pullRequests?: readonly ApiPullRequest[];
  };

  return resources.pullRequests ?? [];
}

function groupResources(resources: readonly Resource[]): readonly ResourceGroupView[] {
  const groups = new Map<ResourceKind, Resource[]>();
  for (const resource of resources) {
    const existing = groups.get(resource.kind) ?? [];
    existing.push(resource);
    groups.set(resource.kind, existing);
  }

  return resourceOrder.map((kind) => ({ items: groups.get(kind) ?? [], kind }));
}

function compareResourceActivity(left: Resource, right: Resource): number {
  const leftTime = new Date(left.sortAt).getTime();
  const rightTime = new Date(right.sortAt).getTime();

  return getSortableTime(leftTime) - getSortableTime(rightTime);
}

function getResourcesForBundle(bundle: TaskBundle): readonly Resource[] {
  return [
    ...bundle.resources.tickets.map((ticket) =>
      resource(
        "ticket",
        ticket.externalId,
        ticket.url == null ? "Ticket" : getUrlHost(ticket.url),
        ticket.url == null ? "Unlinked" : "Linked",
        formatActivityTime(ticket.createdAt),
        ticket.createdAt,
        {
          href: ticket.url,
          id: ticket.id,
          taskId: ticket.taskId
        }
      )
    ),
    ...bundle.resources.sessions.map((session) =>
      resource(
        "session",
        session.displayTitle ?? session.providerId ?? capitalize(session.provider),
        capitalize(session.provider),
        "Claimed",
        formatActivityTime(session.claimedAt ?? session.createdAt),
        session.claimedAt ?? session.createdAt,
        {
          href: null,
          id: session.id,
          taskId: session.taskId
        }
      )
    ),
    ...bundle.resources.artifacts.map(resourceFromArtifact),
    ...getPullRequestsForBundle(bundle).map(resourceFromPullRequest),
    ...bundle.children.map((child) =>
      resource(
        "subtask",
        child.title,
        child.id.slice(0, 8),
        "Open",
        formatActivityTime(child.createdAt),
        child.updatedAt,
        {
          href: null,
          id: child.id,
          taskId: child.parentTaskId ?? bundle.task.id
        }
      )
    )
  ];
}

function resourceFromArtifact(artifact: ApiArtifact): Resource {
  const createdAt = formatActivityTime(artifact.createdAt);

  return resource(
    "artifact",
    getFileName(artifact.uri),
    createdAt,
    artifact.archivedAt == null ? "Ready" : "Archived",
    createdAt,
    artifact.archivedAt ?? artifact.createdAt,
    {
      archivedAt: artifact.archivedAt,
      href: null,
      id: artifact.id,
      metaLabel: artifact.label,
      taskId: artifact.taskId
    }
  );
}

function resourceFromPullRequest(pullRequest: ApiPullRequest): Resource {
  const pullRequestNumber = getPullRequestNumber(pullRequest.url);
  return resource(
    "pr",
    pullRequestNumber == null ? "Pull request" : `PR ${String(pullRequestNumber)}`,
    pullRequest.url,
    "Registered",
    formatActivityTime(pullRequest.createdAt),
    pullRequest.createdAt,
    {
      href: pullRequest.url,
      id: pullRequest.id,
      taskId: pullRequest.taskId
    }
  );
}

function resource(
  kind: ResourceKind,
  label: string,
  detail: string,
  state: string,
  updatedAt: string,
  sortAt: string,
  options: {
    readonly archivedAt?: string | null;
    readonly href: string | null;
    readonly id: string;
    readonly metaLabel?: string | null;
    readonly taskId: string;
  }
): Resource {
  const pullRequestRepository = kind === "pr" && options.href != null
    ? getPullRequestRepository(options.href)
    : null;

  return {
    archivedAt: options.archivedAt ?? null,
    detail,
    href: options.href,
    id: options.id,
    key: `${kind}-${options.taskId}-${options.id}`,
    kind,
    label,
    metaLabel: options.metaLabel ?? null,
    pullRequestNumber: kind === "pr" && options.href != null
      ? getPullRequestNumber(options.href)
      : null,
    pullRequestRepository,
    sortAt,
    state,
    taskId: options.taskId,
    updatedAt
  };
}

function getSortableTime(value: number): number {
  return Number.isNaN(value) ? 0 : value;
}

function getUrlHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "URL";
  }
}

function getPullRequestNumber(value: string): number | null {
  const parsed = parsePullRequestUrl(value);
  return parsed?.number ?? null;
}

function getPullRequestRepository(value: string): string | null {
  const parsed = parsePullRequestUrl(value);
  return parsed?.repository ?? null;
}

function parsePullRequestUrl(value: string): {
  readonly number: number;
  readonly repository: string;
} | null {
  try {
    const url = new URL(value);
    const [owner, repo, pull, numberValue] = url.pathname.split("/").filter(Boolean);
    const number = Number.parseInt(numberValue ?? "", 10);
    if (owner == null || repo == null || pull !== "pull" || !Number.isInteger(number)) {
      return null;
    }

    return {
      number,
      repository: repo
    };
  } catch {
    return null;
  }
}

function getFileName(value: string): string {
  const path = getPathFromUri(value);
  const segments = path.split(/[\\/]/).filter(Boolean);
  return decodeUriPart(segments.at(-1) ?? value);
}

function getPathFromUri(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "file:" ? url.pathname : value;
  } catch {
    return value;
  }
}

function decodeUriPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const elapsedMs = Date.now() - date.getTime();
  if (elapsedMs >= 0 && elapsedMs < 60 * 60 * 1000) {
    const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));
    return `${String(elapsedMinutes)} min`;
  }

  if (elapsedMs >= 0 && elapsedMs < 24 * 60 * 60 * 1000) {
    return `${String(Math.max(1, Math.floor(elapsedMs / (60 * 60 * 1000))))} hr`;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short"
  }).format(date);
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
