import { apiClient } from "@/lib/api";

export type ApiTask = {
  readonly createdAt: string;
  readonly description: string | null;
  readonly id: string;
  readonly parentTaskId: string | null;
  readonly state: TaskState;
  readonly title: string;
  readonly updatedAt: string;
};

export type TaskState =
  | "ready"
  | "research"
  | "plan"
  | "implement"
  | "code_review"
  | "merged"
  | "done";

export type ApiArtifact = {
  readonly createdAt: string;
  readonly createdBySessionId: string | null;
  readonly id: string;
  readonly label: "research" | "plan" | "implement" | "other";
  readonly taskId: string;
  readonly uri: string;
};

export type ApiPullRequest = {
  readonly createdAt: string;
  readonly id: string;
  readonly taskId: string;
  readonly url: string;
};

export type ArtifactContentKind = "html" | "image" | "markdown" | "unsupported";

export type ApiArtifactContent = {
  readonly artifact: ApiArtifact;
  readonly content: string | null;
  readonly contentType: string;
  readonly encoding: "base64" | "utf8" | null;
  readonly fileName: string;
  readonly kind: ArtifactContentKind;
  readonly sizeBytes: number;
};

export type ApiSession = {
  readonly actionId: string | null;
  readonly claimedAt: string | null;
  readonly createdAt: string;
  readonly displayTitle: string | null;
  readonly id: string;
  readonly provider: string;
  readonly providerId: string | null;
  readonly taskId: string;
  readonly transcriptPath: string | null;
};

export type TaskActionPromptValues = {
  readonly worktree?: {
    readonly enabled: boolean;
    readonly path?: string;
  };
};

export type CreateTaskSessionInput = {
  readonly actionId: string;
  readonly claimed: boolean;
  readonly provider: string;
};

export type ApiTicket = {
  readonly createdAt: string;
  readonly externalId: string;
  readonly id: string;
  readonly taskId: string;
  readonly url: string | null;
};

export type ApiTaskActionBooleanOption = {
  readonly default: boolean;
  readonly fields?: {
    readonly path?: {
      readonly default: string;
      readonly type: "text";
    };
  };
  readonly label: string;
  readonly type: "boolean";
};

export type ApiTaskActionOptions = {
  readonly worktree?: ApiTaskActionBooleanOption;
};

export type TaskActionId =
  | "research"
  | "plan"
  | "implement"
  | "breakdown"
  | "code_review";

export type ApiTaskAction = {
  readonly description: string;
  readonly id: TaskActionId;
  readonly isRecommended: boolean;
  readonly label: string;
  readonly options: ApiTaskActionOptions | null;
};

export type TaskResources = {
  readonly artifacts: readonly ApiArtifact[];
  readonly pullRequests: readonly ApiPullRequest[];
  readonly sessions: readonly ApiSession[];
  readonly tickets: readonly ApiTicket[];
};

export type TaskBundle = {
  readonly actions: readonly ApiTaskAction[];
  readonly children: readonly ApiTask[];
  readonly resources: TaskResources;
  readonly task: ApiTask;
};

export type CreateTaskInput = {
  readonly description: string | null;
  readonly parentTaskId: string | null;
  readonly title: string;
};

export type CreateTicketInput = {
  readonly externalId: string;
  readonly url: string | null;
};

export type LinearStateOption = {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly type: string;
};

export type LinearIssueStatus = {
  readonly id: string;
  readonly identifier: string;
  readonly state: LinearStateOption & {
    readonly team: {
      readonly id: string;
      readonly key: string;
      readonly name: string;
    };
  };
  readonly url: string;
};

export type LinearIssueDetails = LinearIssueStatus & {
  readonly description: string | null;
  readonly title: string;
};

export type LinearTeamOption = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly states: readonly LinearStateOption[];
};

export type LinearProjectOption = {
  readonly id: string;
  readonly name: string;
  readonly teamIds: readonly string[];
};

export type LinearOptions = {
  readonly configured: boolean;
  readonly projects: readonly LinearProjectOption[];
  readonly teams: readonly LinearTeamOption[];
};

export type CreateLinearTicketInput = {
  readonly description: string | null;
  readonly projectId: string | null;
  readonly stateId: string;
  readonly teamId: string;
  readonly title: string;
};

export type CreateTaskFromLinearTicketInput = {
  readonly identifier: string;
};

export async function listTaskBundles(): Promise<readonly TaskBundle[]> {
  const { tasks } = await apiClient.get<{ readonly tasks: readonly ApiTask[] }>("/tasks");
  return Promise.all(
    tasks.map(async (task) => {
      const [{ actions }, { resources }, { tasks: children }] = await Promise.all([
        apiClient.get<{ readonly actions: readonly ApiTaskAction[] }>(
          `/tasks/${task.id}/actions`
        ),
        apiClient.get<{ readonly resources: TaskResources }>(`/tasks/${task.id}/resources`),
        apiClient.get<{ readonly tasks: readonly ApiTask[] }>(`/tasks/${task.id}/children`)
      ]);

      return { actions, children, resources, task };
    })
  );
}

export async function createTask(input: CreateTaskInput): Promise<ApiTask> {
  const { task } = await apiClient.post<{ readonly task: ApiTask }>("/tasks", input);
  return task;
}

export async function createTaskSession(
  taskId: string,
  input: CreateTaskSessionInput
): Promise<ApiSession> {
  const { session } = await apiClient.post<{ readonly session: ApiSession }>(
    `/tasks/${taskId}/sessions`,
    input
  );
  return session;
}

export async function renderTaskSessionPrompt(
  taskId: string,
  sessionId: string,
  promptOptions?: TaskActionPromptValues
): Promise<string> {
  const { prompt } = await apiClient.post<{ readonly prompt: string }>(
    `/tasks/${taskId}/sessions/${sessionId}/prompt`,
    promptOptions == null ? {} : { promptOptions }
  );
  return prompt;
}

export async function createTaskTicket(
  taskId: string,
  input: CreateTicketInput
): Promise<ApiTicket> {
  const { ticket } = await apiClient.post<{ readonly ticket: ApiTicket }>(
    `/tasks/${taskId}/tickets`,
    input
  );
  return ticket;
}

export async function getTaskArtifact(
  taskId: string,
  artifactId: string
): Promise<ApiArtifact> {
  const { artifact } = await apiClient.get<{ readonly artifact: ApiArtifact }>(
    `/tasks/${taskId}/artifacts/${artifactId}`
  );
  return artifact;
}

export async function getTaskArtifactContent(
  taskId: string,
  artifactId: string
): Promise<ApiArtifactContent> {
  const { content } = await apiClient.get<{
    readonly content: ApiArtifactContent;
  }>(`/tasks/${taskId}/artifacts/${artifactId}/content`);
  return content;
}

export async function getLinearOptions(): Promise<LinearOptions> {
  const { linear } = await apiClient.get<{ readonly linear: LinearOptions }>(
    "/linear/options"
  );
  return linear;
}

export async function listLinearIssueStatuses(
  identifiers: readonly string[]
): Promise<readonly LinearIssueStatus[]> {
  const uniqueIdentifiers = Array.from(new Set(identifiers));
  if (uniqueIdentifiers.length === 0) {
    return [];
  }

  const { issues } = await apiClient.post<{
    readonly issues: readonly LinearIssueStatus[];
  }>("/linear/issues/statuses", { identifiers: uniqueIdentifiers });
  return issues;
}

export async function resolveLinearIssue(
  identifier: string
): Promise<LinearIssueDetails> {
  const { issue } = await apiClient.post<{ readonly issue: LinearIssueDetails }>(
    "/linear/issues/resolve",
    { identifier }
  );
  return issue;
}

export async function createLinearTaskTicket(
  taskId: string,
  input: CreateLinearTicketInput
): Promise<ApiTicket> {
  const { ticket } = await apiClient.post<{ readonly ticket: ApiTicket }>(
    `/tasks/${taskId}/linear-ticket`,
    input
  );
  return ticket;
}

export async function createTaskFromLinearTicket(
  input: CreateTaskFromLinearTicketInput
): Promise<ApiTask> {
  const { task } = await apiClient.post<{ readonly task: ApiTask }>(
    "/linear/tasks",
    input
  );
  return task;
}
