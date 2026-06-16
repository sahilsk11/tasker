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
  readonly worktree?: {
    readonly enabled: boolean;
    readonly path: string;
  };
};

export const knownPromptPlaceholders = [
  "artifactAttribution",
  "registerDoc",
  "registerPr",
  "registerSession",
  "taskHeader",
  "worktree"
] as const;

export type KnownPromptPlaceholder = (typeof knownPromptPlaceholders)[number];
