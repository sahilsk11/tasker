import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { taskStates } from "../domain/task.js";
import type { TaskState } from "../domain/task.js";
import type { LinearStateMappingRepository } from "../repository/linear-state-mapping.repository.js";
import type { LinearService } from "../service/linear.service.js";
import type { TaskService } from "../service/task.service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1)
});

const createLinearIssueSchema = z.object({
  description: z.string().nullable().default(null),
  projectId: z.string().nullable().default(null),
  stateId: z.string().min(1),
  teamId: z.string().min(1),
  title: z.string().min(1)
});

const linearIssueStatusesSchema = z.object({
  identifiers: z.array(z.string().min(1)).max(100)
});

const createTaskFromLinearIssueSchema = z.object({
  identifier: z.string().min(1)
});

const linearStateMappingParamsSchema = z.object({
  teamId: z.string().min(1)
});

const updateLinearStateMappingsSchema = z.object({
  mappings: z.record(z.enum(taskStates), z.string().nullable())
});

export function registerLinearResolver(
  server: FastifyInstance,
  taskService: TaskService,
  linearService: LinearService,
  linearStateMappings: LinearStateMappingRepository
): void {
  server.get("/linear/options", async () => ({
    linear: await linearService.getOptions()
  }));

  server.get("/linear/state-mappings", async () => ({
    mappings: await linearStateMappings.list()
  }));

  server.put("/linear/state-mappings/:teamId", async (request) => {
    const { teamId } = linearStateMappingParamsSchema.parse(request.params);
    const { mappings } = updateLinearStateMappingsSchema.parse(request.body);

    return {
      mappings: await linearStateMappings.updateForTeam({
        mappings: new Map(
          Object.entries(mappings).map(([taskState, linearStateId]) => [
            taskState as TaskState,
            linearStateId == null || linearStateId.trim() === ""
              ? null
              : linearStateId
          ])
        ),
        teamId
      })
    };
  });

  server.post("/linear/issues/statuses", async (request) => {
    const { identifiers } = linearIssueStatusesSchema.parse(request.body);
    return {
      issues: await linearService.getIssueStatuses(identifiers)
    };
  });

  server.post("/linear/issues/resolve", async (request) => {
    const { identifier } = createTaskFromLinearIssueSchema.parse(request.body);
    return {
      issue: await linearService.getIssue(identifier)
    };
  });

  server.post("/linear/tasks", async (request, reply) => {
    const { identifier } = createTaskFromLinearIssueSchema.parse(request.body);
    const issue = await linearService.getIssue(identifier);
    const task = await taskService.createTask({
      description: issue.description,
      parentTaskId: null,
      title: issue.title
    });
    const ticket = await taskService.addTicket(task.id, {
      externalId: issue.identifier,
      url: issue.url
    });

    return reply.code(201).send({ issue, task, ticket });
  });

  server.post("/tasks/:id/linear-ticket", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const input = createLinearIssueSchema.parse(request.body);
    const issue = await linearService.createIssue(input);
    const ticket = await taskService.addTicket(id, {
      externalId: issue.identifier,
      url: issue.url
    });

    return reply.code(201).send({ issue, ticket });
  });
}
