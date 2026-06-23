export type RuntimeInfo = {
  readonly databasePath: string;
  readonly nodeVersion: string;
  readonly ok: true;
  readonly pid: number;
  readonly publicApiBaseUrl: string;
  readonly service: "tasker-api";
  readonly taskActionsPath: string;
  readonly uptimeSeconds: number;
};

export type ApiTaskSession = {
  readonly actionId: string | null;
  readonly claimedAt: string | null;
  readonly createdAt: string;
  readonly displayTitle: string | null;
  readonly id: string;
  readonly metadata: Record<string, unknown> | null;
  readonly provider: string;
  readonly providerId: string | null;
  readonly taskId: string;
  readonly transcriptPath: string | null;
};

export type ApiTaskOverview = {
  readonly action: ApiTaskAction | null;
  readonly children: readonly ApiTask[];
  readonly latestTaskActivityAt: string;
  readonly resources: ApiTaskResources;
  readonly task: ApiTask;
};

export type ApiTask = {
  readonly createdAt: string;
  readonly description: string | null;
  readonly id: string;
  readonly parentTaskId: string | null;
  readonly state: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly workingDirectory: string | null;
  readonly waitingDependencies: readonly unknown[];
};

export type ApiTaskAction = {
  readonly description: string;
  readonly iconName: string | null;
  readonly id: string;
  readonly isRecommended: boolean;
  readonly label: string;
  readonly options: unknown;
};

export type ApiTaskResources = {
  readonly artifacts: readonly ApiTaskArtifact[];
  readonly pullRequests: readonly ApiTaskPullRequest[];
  readonly sessions: readonly ApiTaskSession[];
  readonly tickets: readonly ApiTaskTicket[];
};

export type ApiTaskArtifact = {
  readonly createdAt: string;
  readonly createdBySessionId: string | null;
  readonly id: string;
  readonly label: string;
  readonly taskId: string;
  readonly uri: string;
};

export type ApiTaskPullRequest = {
  readonly createdAt: string;
  readonly id: string;
  readonly taskId: string;
  readonly url: string;
};

export type ApiTaskTicket = {
  readonly createdAt: string;
  readonly externalId: string;
  readonly id: string;
  readonly taskId: string;
  readonly url: string | null;
};

export type CreateSessionResponse = {
  readonly session: ApiTaskSession;
};

export type ClaimSessionResponse = {
  readonly session: ApiTaskSession;
  readonly taskOverview: ApiTaskOverview;
};

export type CreateArtifactResponse = {
  readonly artifact: ApiTaskArtifact;
};

export type CreatePullRequestResponse = {
  readonly pullRequest: ApiTaskPullRequest;
};
