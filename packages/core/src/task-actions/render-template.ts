import {
  buildArtifactAttributionSection,
  buildArtifactRegistrationSection,
  buildBreakdownWorkflowSection,
  buildLegacyWorktreeSection,
  buildOptionsSection,
  buildPullRequestRegistrationSection,
  buildSessionClaimSection,
  buildTaskDescriptionSection,
  buildTaskHeaderSection,
  buildTaskNotesRegistrationSection,
  buildTaskTitleSection
} from "./prompt-sections.js";
import type { KnownPromptPlaceholder, TaskActionPromptContext } from "./types.js";
import { UnknownPromptPlaceholderError } from "./validate-template.js";

const substitutionRegistry: Record<
  KnownPromptPlaceholder,
  (context: TaskActionPromptContext) => string
> = {
  artifactAttribution: buildArtifactAttributionSection,
  breakdownWorkflow: buildBreakdownWorkflowSection,
  options: buildOptionsSection,
  registerDoc: buildTaskNotesRegistrationSection,
  registerArtifact: buildArtifactRegistrationSection,
  registerPr: buildPullRequestRegistrationSection,
  registerSession: buildSessionClaimSection,
  taskDescription: buildTaskDescriptionSection,
  taskHeader: buildTaskHeaderSection,
  taskTitle: buildTaskTitleSection,
  worktree: buildLegacyWorktreeSection
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
