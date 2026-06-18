export type TaskActionPromptContext = {
  readonly action: {
    readonly id: string;
    readonly label: string;
  };
  readonly apiBaseUrl: string;
  readonly sessionId: string;
  readonly taskDescription: string | null;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly optionsText?: string | undefined;
};

export const knownPromptPlaceholders = [
  "artifactAttribution",
  "breakdownWorkflow",
  "options",
  "registerDoc",
  "registerArtifact",
  "registerPr",
  "registerSession",
  "taskDescription",
  "taskHeader",
  "taskTitle",
  "worktree"
] as const;

export type KnownPromptPlaceholder = (typeof knownPromptPlaceholders)[number];
