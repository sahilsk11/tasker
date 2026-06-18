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
  readonly optionsText?: string;
};

export const knownPromptPlaceholders = [
  "breakdownWorkflow",
  "options",
  "registerArtifact",
  "registerPr",
  "registerSession",
  "taskDescription",
  "taskTitle"
] as const;

export type KnownPromptPlaceholder = (typeof knownPromptPlaceholders)[number];
