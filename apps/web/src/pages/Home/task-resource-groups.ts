import type { ApiArtifact, ApiPullRequest, TaskBundle } from "@/api/tasks";

export type ResourceKind =
  | "ticket"
  | "session"
  | "artifact"
  | "worktree"
  | "pr"
  | "subtask";

export type Resource = {
  readonly detail: string;
  readonly href: string | null;
  readonly id: string;
  readonly key: string;
  readonly kind: ResourceKind;
  readonly label: string;
  readonly pullRequestNumber: number | null;
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

function groupResources(resources: readonly Resource[]): readonly ResourceGroupView[] {
  const groups = new Map<ResourceKind, Resource[]>();
  for (const resource of resources) {
    const existing = groups.get(resource.kind) ?? [];
    existing.push(resource);
    groups.set(resource.kind, existing);
  }

  return resourceOrder.map((kind) => ({ items: groups.get(kind) ?? [], kind }));
}

function getResourcesForBundle(bundle: TaskBundle): readonly Resource[] {
  return [
    ...bundle.resources.tickets.map((ticket) =>
      resource(
        "ticket",
        ticket.externalId,
        ticket.url == null ? "Ticket" : getUrlHost(ticket.url),
        ticket.url == null ? "Unlinked" : "Linked",
        formatDate(ticket.createdAt),
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
        session.providerId ?? capitalize(session.provider),
        capitalize(session.provider),
        "Claimed",
        formatDate(session.claimedAt ?? session.createdAt),
        {
          href: null,
          id: session.id,
          taskId: session.taskId
        }
      )
    ),
    ...bundle.resources.artifacts.map(resourceFromArtifact),
    ...bundle.resources.pullRequests.map(resourceFromPullRequest),
    ...bundle.children.map((child) =>
      resource(
        "subtask",
        child.title,
        child.id.slice(0, 8),
        "Open",
        formatDate(child.createdAt),
        {
          href: null,
          id: child.id,
          taskId: child.id
        }
      )
    )
  ];
}

function resourceFromArtifact(artifact: ApiArtifact): Resource {
  return resource(
    "artifact",
    artifact.label,
    artifact.uri,
    "Ready",
    formatDate(artifact.createdAt),
    {
      href: null,
      id: artifact.id,
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
    formatDate(pullRequest.createdAt),
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
  options: {
    readonly href: string | null;
    readonly id: string;
    readonly taskId: string;
  }
): Resource {
  return {
    detail,
    href: options.href,
    id: options.id,
    key: `${kind}-${options.taskId}-${options.id}`,
    kind,
    label,
    pullRequestNumber: kind === "pr" && options.href != null
      ? getPullRequestNumber(options.href)
      : null,
    state,
    taskId: options.taskId,
    updatedAt
  };
}

function getUrlHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "URL";
  }
}

function getPullRequestNumber(value: string): number | null {
  try {
    const url = new URL(value);
    const [owner, repo, pull, numberValue] = url.pathname.split("/").filter(Boolean);
    const number = Number.parseInt(numberValue ?? "", 10);
    if (owner == null || repo == null || pull !== "pull" || !Number.isInteger(number)) {
      return null;
    }

    return number;
  } catch {
    return null;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short"
  }).format(date);
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
