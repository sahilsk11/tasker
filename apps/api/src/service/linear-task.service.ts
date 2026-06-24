import type { TaskTicket } from "../domain/task-ticket.js";
import type { TaskId, TaskWithDependencyState } from "../domain/task.js";
import type {
  CreateLinearIssueInput,
  LinearIssue,
  LinearIssueDetails,
  LinearService
} from "./linear.service.js";
import type { TaskService } from "./task.service.js";

export type CreateTaskFromLinearIssueInput = {
  readonly identifier: string;
};

export type CreateTaskFromLinearIssueResult = {
  readonly issue: LinearIssueDetails;
  readonly task: TaskWithDependencyState;
  readonly ticket: TaskTicket;
};

export type CreateLinearIssueForTaskResult = {
  readonly issue: LinearIssue;
  readonly ticket: TaskTicket;
};

export class LinearTaskService {
  public constructor(
    private readonly linearService: LinearService,
    private readonly taskService: TaskService
  ) {}

  public async createTaskFromLinearIssue(
    input: CreateTaskFromLinearIssueInput
  ): Promise<CreateTaskFromLinearIssueResult> {
    const issue = await this.linearService.getIssue(input.identifier);
    const task = await this.taskService.createTask({
      description: issue.description,
      parentTaskId: null,
      title: issue.title
    });
    const ticket = await this.taskService.addTicket(task.id, {
      externalId: issue.identifier,
      url: issue.url
    });

    return { issue, task, ticket };
  }

  public async createLinearIssueForTask(
    taskId: TaskId,
    input: CreateLinearIssueInput
  ): Promise<CreateLinearIssueForTaskResult> {
    const issue = await this.linearService.createIssue(input);
    const ticket = await this.taskService.addTicket(taskId, {
      externalId: issue.identifier,
      url: issue.url
    });

    return { issue, ticket };
  }
}
