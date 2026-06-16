import {
  buildArtifactAttributionSection,
  buildPullRequestRegistrationSection,
  buildSessionClaimSection,
  buildTaskHeaderSection,
  buildTaskNotesRegistrationSection,
  buildWorktreeSection
} from "./prompt-sections.js";
import type { KnownPromptPlaceholder, TaskActionPromptContext } from "./types.js";
import { UnknownPromptPlaceholderError } from "./validate-template.js";

const substitutionRegistry: Record<
  KnownPromptPlaceholder,
  (context: TaskActionPromptContext) => string
> = {
  artifactAttribution: buildArtifactAttributionSection,
  registerDoc: buildTaskNotesRegistrationSection,
  registerPr: buildPullRequestRegistrationSection,
  registerSession: buildSessionClaimSection,
  taskHeader: buildTaskHeaderSection,
  worktree: buildWorktreeSection
};

export function renderTaskActionTemplate(
  template: string,
  context: TaskActionPromptContext
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, placeholder: string) => {
    if (!isKnownPromptPlaceholder(placeholder)) {
      throw new UnknownPromptPlaceholderError(placeholder);
    }

    return substitutionRegistry[placeholder](context);
  });
}

function isKnownPromptPlaceholder(name: string): name is KnownPromptPlaceholder {
  return Object.hasOwn(substitutionRegistry, name);
}
