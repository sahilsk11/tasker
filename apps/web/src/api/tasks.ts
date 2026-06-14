import { apiClient } from "@/lib/api";

export type ApiTask = {
  readonly createdAt: string;
  readonly description: string | null;
  readonly id: string;
  readonly parentTaskId: string | null;
  readonly title: string;
  readonly updatedAt: string;
};

export type ApiArtifact = {
  readonly createdAt: string;
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly taskId: string;
  readonly uri: string;
};

export type ApiSession = {
  readonly createdAt: string;
  readonly id: string;
  readonly provider: "codex" | "cursor" | "opencode";
  readonly taskId: string;
};

export type ApiTicket = {
  readonly createdAt: string;
  readonly externalId: string;
  readonly id: string;
  readonly taskId: string;
  readonly url: string | null;
};

export type ApiTaskAction = {
  readonly description: string;
  readonly id: string;
  readonly isRecommended: boolean;
  readonly label: string;
  readonly prompt: string;
};

export type TaskResources = {
  readonly artifacts: readonly ApiArtifact[];
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

export async function getLinearOptions(): Promise<LinearOptions> {
  const { linear } = await apiClient.get<{ readonly linear: LinearOptions }>(
    "/linear/options"
  );
  return linear;
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
