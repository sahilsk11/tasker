import assert from "node:assert/strict";
import test from "node:test";
import type { CreateTaskTicketInput, TaskTicket } from "../domain/task-ticket.js";
import type { CreateTaskInput, TaskId, TaskWithDependencyState } from "../domain/task.js";
import { LinearTaskService } from "./linear-task.service.js";
import type {
  CreateLinearIssueInput,
  LinearIssue,
  LinearIssueDetails,
  LinearService
} from "./linear.service.js";
import type { TaskService } from "./task.service.js";

void test("linear task service creates a task from an existing Linear issue", async () => {
  const issue = createLinearIssueDetails();
  const task = createTask();
  const ticket = createTicket({ taskId: task.id });
  const getIssueCalls: string[] = [];
  const createTaskCalls: Array<{
    readonly description: string | null;
    readonly parentTaskId: string | null;
    readonly title: string;
  }> = [];
  const addTicketCalls: Array<{
    readonly input: { readonly externalId: string; readonly url: string | null };
    readonly taskId: string;
  }> = [];
  const service = new LinearTaskService(
    {
      getIssue: (identifier: string) => {
        getIssueCalls.push(identifier);
        return Promise.resolve(issue);
      }
    } as unknown as LinearService,
    {
      addTicket: (taskId: TaskId, input: CreateTaskTicketInput) => {
        addTicketCalls.push({ input, taskId });
        return Promise.resolve(ticket);
      },
      createTask: (input: CreateTaskInput) => {
        createTaskCalls.push(input);
        return Promise.resolve(task);
      }
    } as unknown as TaskService
  );

  const result = await service.createTaskFromLinearIssue({ identifier: "SAS-42" });

  assert.deepEqual(getIssueCalls, ["SAS-42"]);
  assert.deepEqual(createTaskCalls, [
    {
      description: "Import the existing issue details.",
      parentTaskId: null,
      title: "Imported task"
    }
  ]);
  assert.deepEqual(addTicketCalls, [
    {
      input: {
        externalId: "SAS-42",
        url: "https://linear.app/example/issue/SAS-42"
      },
      taskId: "task-1"
    }
  ]);
  assert.deepEqual(result, { issue, task, ticket });
});

void test("linear task service creates a Linear issue for an existing task", async () => {
  const issue: LinearIssue = {
    id: "issue-2",
    identifier: "SAS-43",
    url: "https://linear.app/example/issue/SAS-43"
  };
  const ticket = createTicket({
    externalId: issue.identifier,
    taskId: "task-2",
    url: issue.url
  });
  const createIssueCalls: CreateLinearIssueInput[] = [];
  const addTicketCalls: Array<{
    readonly input: { readonly externalId: string; readonly url: string | null };
    readonly taskId: string;
  }> = [];
  const service = new LinearTaskService(
    {
      createIssue: (input: CreateLinearIssueInput) => {
        createIssueCalls.push(input);
        return Promise.resolve(issue);
      }
    } as unknown as LinearService,
    {
      addTicket: (taskId: TaskId, input: CreateTaskTicketInput) => {
        addTicketCalls.push({ input, taskId });
        return Promise.resolve(ticket);
      }
    } as unknown as TaskService
  );
  const input: CreateLinearIssueInput = {
    description: "Create a linked ticket.",
    projectId: "project-1",
    stateId: "state-1",
    teamId: "team-1",
    title: "Linked task"
  };

  const result = await service.createLinearIssueForTask("task-2", input);

  assert.deepEqual(createIssueCalls, [input]);
  assert.deepEqual(addTicketCalls, [
    {
      input: {
        externalId: "SAS-43",
        url: "https://linear.app/example/issue/SAS-43"
      },
      taskId: "task-2"
    }
  ]);
  assert.deepEqual(result, { issue, ticket });
});

function createLinearIssueDetails(): LinearIssueDetails {
  return {
    description: "Import the existing issue details.",
    id: "issue-1",
    identifier: "SAS-42",
    state: {
      id: "state-1",
      name: "Todo",
      position: 1,
      team: {
        id: "team-1",
        key: "SAS",
        name: "SAS"
      },
      type: "unstarted"
    },
    title: "Imported task",
    url: "https://linear.app/example/issue/SAS-42"
  };
}

function createTask(): TaskWithDependencyState {
  const now = new Date("2026-06-24T00:00:00.000Z");
  return {
    createdAt: now,
    description: "Import the existing issue details.",
    id: "task-1",
    parentTaskId: null,
    state: "ready",
    title: "Imported task",
    updatedAt: now,
    waitingDependencies: [],
    workingDirectory: null
  };
}

function createTicket(
  overrides: Partial<Pick<TaskTicket, "externalId" | "taskId" | "url">> = {}
): TaskTicket {
  return {
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    externalId: overrides.externalId ?? "SAS-42",
    id: "ticket-1",
    taskId: overrides.taskId ?? "task-1",
    url: overrides.url ?? "https://linear.app/example/issue/SAS-42"
  };
}
