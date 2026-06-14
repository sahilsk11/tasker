import type { ApiArtifact, TaskBundle } from "@/api/tasks";

export type ResourceKind =
  | "ticket"
  | "session"
  | "artifact"
  | "worktree"
  | "pr"
  | "subtask";

export type Resource = {
  readonly detail: string;
  readonly kind: ResourceKind;
  readonly label: string;
  readonly state: string;
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
        formatDate(ticket.createdAt)
      )
    ),
    ...bundle.resources.sessions.map((session) =>
      resource(
        "session",
        session.provider,
        capitalize(session.provider),
        "Created",
        formatDate(session.createdAt)
      )
    ),
    ...bundle.resources.artifacts.map(resourceFromArtifact),
    ...bundle.children.map((child) =>
      resource(
        "subtask",
        child.title,
        child.id.slice(0, 8),
        "Open",
        formatDate(child.createdAt)
      )
    )
  ];
}

function resourceFromArtifact(artifact: ApiArtifact): Resource {
  const kind = getArtifactResourceKind(artifact.kind);
  return resource(
    kind,
    artifact.label,
    kind === "artifact" ? artifact.kind : artifact.uri,
    "Ready",
    formatDate(artifact.createdAt)
  );
}

function getArtifactResourceKind(kind: string): ResourceKind {
  const normalized = kind.toLowerCase();
  if (normalized === "pr" || normalized === "pull_request" || normalized === "pull-request") {
    return "pr";
  }

  if (normalized === "worktree") {
    return "worktree";
  }

  return "artifact";
}

function resource(
  kind: ResourceKind,
  label: string,
  detail: string,
  state: string,
  updatedAt: string
): Resource {
  return { detail, kind, label, state, updatedAt };
}

function getUrlHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "URL";
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
