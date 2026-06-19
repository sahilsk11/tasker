import { apiClient } from "@/lib/api";

export type ApiTask = {
  readonly createdAt: string;
  readonly description: string | null;
  readonly id: string;
  readonly parentTaskId: string | null;
  readonly state: TaskState;
  readonly title: string;
  readonly updatedAt: string;
  readonly waitingDependencies: readonly ApiTaskDependency[];
  readonly workingDirectory: string | null;
};

export type ApiTaskDependency = {
  readonly id: string;
  readonly state: TaskState;
  readonly title: string;
};

export type TaskStateDefinition = {
  readonly label: string;
  readonly rank: number;
  readonly value: TaskState;
};

export type TaskState =
  | "ready"
  | "scoping"
  | "planning"
  | "implementation"
  | "review"
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
  readonly metadata: Record<string, unknown> | null;
  readonly provider: string;
  readonly providerId: string | null;
  readonly taskId: string;
  readonly transcriptPath: string | null;
};

export type TaskActionPromptValues = {
  readonly options?: Record<
    string,
    {
      readonly enabled: boolean;
      readonly fields?: Record<string, string>;
    }
  >;
  readonly workingPath?: string;
};

export type CreateTaskSessionInput = {
  readonly actionId: string;
  readonly claimed: boolean;
  readonly provider: string;
};

export type RunTaskSessionPromptInput = {
  readonly prompt: string;
  readonly provider?: string | null;
  readonly workingPath: string;
};

export type RunTaskSessionPromptResult = {
  readonly launch: {
    readonly metadata?: Record<string, unknown>;
    readonly openUrl?: string | null;
    readonly provider: string;
  };
  readonly session: ApiSession;
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
  readonly fields?: Record<
    string,
    {
      readonly default: string;
      readonly label?: string;
      readonly type: "text";
    }
  >;
  readonly label: string;
  readonly prompt?: {
    readonly disabled?: string;
    readonly enabled: string;
  };
  readonly type: "boolean";
};

export type ApiTaskActionOptions = Record<
  string,
  ApiTaskActionBooleanOption | undefined
>;

export type ApiTaskAction = {
  readonly description: string;
  readonly iconName: string | null;
  readonly id: string;
  readonly isRecommended: boolean;
  readonly label: string;
  readonly options: ApiTaskActionOptions | null;
};

export type ApiTaskActionDetails = ApiTaskAction & {
  readonly createdAt: string;
  readonly enabled: boolean;
  readonly promptTemplate: string;
  readonly recommendationStates: readonly TaskState[];
  readonly sortOrder: number;
  readonly startState: TaskState | null;
  readonly updatedAt: string;
};

export type UpdateTaskActionInput = {
  readonly description?: string;
  readonly enabled?: boolean;
  readonly iconName?: string | null;
  readonly label?: string;
  readonly options?: ApiTaskActionOptions | null;
  readonly promptTemplate?: string;
  readonly recommendationStates?: readonly TaskState[];
  readonly sortOrder?: number;
  readonly startState?: TaskState | null;
};

export type TaskResources = {
  readonly artifacts: readonly ApiArtifact[];
  readonly pullRequests: readonly ApiPullRequest[];
  readonly sessions: readonly ApiSession[];
  readonly tickets: readonly ApiTicket[];
};

export type ApiWorkingPathSettings = {
  readonly defaultWorkingDirectory: string | null;
  readonly defaultWorktreePath: string;
  readonly updatedAt: string;
};

export type WorkingPathConfig = {
  readonly settings: ApiWorkingPathSettings;
};

export type UpdateWorkingPathSettingsInput = {
  readonly defaultWorkingDirectory?: string | null;
  readonly defaultWorktreePath?: string;
};

export type TaskBundle = {
  readonly actions: readonly ApiTaskAction[];
  readonly children: readonly ApiTask[];
  readonly resources: TaskResources;
  readonly task: ApiTask;
};

export type ApiTaskBreakdownItem = {
  readonly dependsOn: readonly string[];
  readonly description: string;
  readonly id: string;
  readonly title: string;
};

export type ApiTaskBreakdown = {
  readonly items: readonly ApiTaskBreakdownItem[];
  readonly schemaVersion: 1;
  readonly summary: string;
  readonly taskId: string;
};

export type ApiTaskBreakdownValidationError = {
  readonly message: string;
  readonly path: string;
};

export type ApiTaskBreakdownWarning =
  | {
      readonly code: "task_has_existing_subtasks";
      readonly existingSubtasks: readonly ApiTask[];
      readonly message: string;
    }
  | {
      readonly code: "dependency_order";
      readonly message: string;
      readonly path: string;
    };

export type ApiTaskBreakdownValidationResult = {
  readonly breakdown: ApiTaskBreakdown | null;
  readonly errors: readonly ApiTaskBreakdownValidationError[];
  readonly previewUrl: string | null;
  readonly valid: boolean;
  readonly warnings: readonly ApiTaskBreakdownWarning[];
};

export type ApiAcceptTaskBreakdownResult = {
  readonly accepted: true;
  readonly createdSubtasks: readonly ApiTask[];
  readonly taskId: string;
};

export type CreateTaskInput = {
  readonly description: string | null;
  readonly parentTaskId: string | null;
  readonly title: string;
  readonly workingDirectory?: string | null;
};

export type UpdateTaskInput = {
  readonly description?: string | null;
  readonly parentTaskId?: string | null;
  readonly state?: TaskState;
  readonly title?: string;
  readonly workingDirectory?: string | null;
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

export async function listTaskBundles(
  parentTaskId: string | null
): Promise<readonly TaskBundle[]> {
  const path =
    parentTaskId == null
      ? "/tasks"
      : `/tasks?parentTaskId=${encodeURIComponent(parentTaskId)}`;
  const { tasks } = await apiClient.get<{ readonly tasks: readonly ApiTask[] }>(path);
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

export async function listTaskStates(): Promise<readonly TaskStateDefinition[]> {
  const { states } = await apiClient.get<{
    readonly states: readonly TaskStateDefinition[];
  }>("/task-states");
  return states;
}

export async function listTaskActionSettings(): Promise<readonly ApiTaskActionDetails[]> {
  const { actions } = await apiClient.get<{
    readonly actions: readonly ApiTaskActionDetails[];
  }>("/actions");
  return actions;
}

export async function updateTaskActionSettings(
  actionId: string,
  input: UpdateTaskActionInput
): Promise<ApiTaskActionDetails> {
  const { action } = await apiClient.patch<{
    readonly action: ApiTaskActionDetails;
  }>(`/actions/${actionId}`, input);
  return action;
}

export async function getWorkingPaths(): Promise<WorkingPathConfig> {
  return apiClient.get<WorkingPathConfig>("/working-paths");
}

export async function updateWorkingPathSettings(
  input: UpdateWorkingPathSettingsInput
): Promise<ApiWorkingPathSettings> {
  const { settings } = await apiClient.patch<{
    readonly settings: ApiWorkingPathSettings;
  }>("/working-paths/settings", input);
  return settings;
}

export async function createTask(input: CreateTaskInput): Promise<ApiTask> {
  const { task } = await apiClient.post<{ readonly task: ApiTask }>("/tasks", input);
  return task;
}

export async function getTask(taskId: string): Promise<ApiTask> {
  const { task } = await apiClient.get<{ readonly task: ApiTask }>(`/tasks/${taskId}`);
  return task;
}

export async function updateTask(
  taskId: string,
  input: UpdateTaskInput
): Promise<ApiTask> {
  const { task } = await apiClient.patch<{ readonly task: ApiTask }>(
    `/tasks/${taskId}`,
    input
  );
  return task;
}

export async function validateTaskBreakdown(
  uri: string
): Promise<ApiTaskBreakdownValidationResult> {
  return apiClient.post<ApiTaskBreakdownValidationResult>("/breakdowns/validate", {
    uri
  });
}

export async function acceptTaskBreakdown(
  uri: string
): Promise<ApiAcceptTaskBreakdownResult> {
  return apiClient.post<ApiAcceptTaskBreakdownResult>("/breakdowns/accept", { uri });
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

export async function runTaskSessionPrompt(
  taskId: string,
  sessionId: string,
  input: RunTaskSessionPromptInput
): Promise<RunTaskSessionPromptResult> {
  return apiClient.post<RunTaskSessionPromptResult>(
    `/tasks/${taskId}/sessions/${sessionId}/run`,
    input
  );
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
