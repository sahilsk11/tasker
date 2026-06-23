export const agentPromptProviderValues = ["codex", "claude-code"] as const;

export type AgentPromptProvider = (typeof agentPromptProviderValues)[number];

export const defaultAgentPromptProvider: AgentPromptProvider = "codex";

export const agentPromptProviders: ReadonlyArray<{
  readonly label: string;
  readonly value: AgentPromptProvider;
}> = [
  { label: "Codex", value: "codex" },
  { label: "Claude Code", value: "claude-code" }
];

export type TaskActionPromptContext = {
  readonly action: {
    readonly id: string;
    readonly label: string;
  };
  readonly agentProvider: AgentPromptProvider;
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
  "ignoreSkills",
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
