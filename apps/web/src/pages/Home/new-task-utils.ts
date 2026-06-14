import type { LinearOptions, LinearProjectOption, LinearTeamOption } from "@/api/tasks";
import { isApiError } from "@/lib/api";

export function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseTicketInput(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (isUrl(trimmed)) {
    return {
      externalId: getTicketIdFromUrl(trimmed),
      url: trimmed
    };
  }

  return {
    externalId: trimmed,
    url: null
  };
}

export function getSelectedLinearTeam(
  linearOptions: LinearOptions | null,
  teamId: string
): LinearTeamOption | null {
  if (teamId.length === 0) {
    return null;
  }

  return linearOptions?.teams.find((team) => team.id === teamId) ?? null;
}

export function getLinearProjectOptions(
  linearOptions: LinearOptions | null,
  teamId: string
): readonly LinearProjectOption[] {
  if (linearOptions == null || teamId.length === 0) {
    return [];
  }

  return linearOptions.projects.filter((project) => project.teamIds.includes(teamId));
}

export function getMutationErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to create task.";
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getTicketIdFromUrl(value: string): string {
  const url = new URL(value);
  const lastPathSegment = url.pathname.split("/").filter(Boolean).at(-1);
  return lastPathSegment ?? value;
}
