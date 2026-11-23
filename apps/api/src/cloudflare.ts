import type { D1Database } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";
import { ZodError } from "zod";
import taskActions from "../task-actions.json" with { type: "json" };
import { parseUpdateTaskActionInput } from "./command/task-action.command.js";
import {
  parseCreateArtifactInput,
  parseCreatePullRequestInput,
  parseCreateTicketInput
} from "./command/task-resource.command.js";
import {
  parseClaimSessionInput,
  parseCreateSessionInput,
  parseSessionContext
} from "./command/task-session.command.js";
import { parseCreateTaskInput, parseUpdateTaskInput } from "./command/task.command.js";
import type { Database } from "./db/schema.js";
import { D1TaskActionRepository } from "./repository/d1-task-action.repository.js";
import { parseTaskActionCatalog } from "./task-actions/catalog.js";
import { SqliteTaskArtifactRepository } from "./repository/task-artifact.repository.js";
import { SqliteTaskPullRequestRepository } from "./repository/task-pull-request.repository.js";
import { SqliteTaskSessionRepository } from "./repository/task-session.repository.js";
import { SqliteTaskTicketRepository } from "./repository/task-ticket.repository.js";
import { SqliteTaskRepository } from "./repository/task.repository.js";
import { ArtifactStorageService } from "./service/artifact-storage.service.js";
import { BadRequestError, ConflictError, NotFoundError } from "./service/errors.js";
import { TaskSessionProviderRegistry } from "./service/session-provider.js";
import { TaskService } from "./service/task.service.js";

type Bindings = {
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> };
  readonly DB: D1Database;
};

type Variables = { readonly tasks: TaskService };

const actionCatalog = parseTaskActionCatalog(taskActions);

function createCloudTaskService(binding: D1Database, origin: string): TaskService {
  const db = new Kysely<Database>({ dialect: new D1Dialect({ database: binding }) });
  return new TaskService(
    new SqliteTaskRepository(db),
    new SqliteTaskArtifactRepository(db),
    new SqliteTaskPullRequestRepository(db),
    new SqliteTaskSessionRepository(db),
    new SqliteTaskTicketRepository(db),
    new D1TaskActionRepository(db, actionCatalog),
    `${origin}/api`,
    new TaskSessionProviderRegistry(),
    new ArtifactStorageService({ activeRoot: "/tmp/artifacts", archiveRoot: "/tmp/archive" }),
    (directory) => {
      const path = directory?.trim();
      return Promise.resolve(path == null || path.length === 0 ? null : path);
    }
  );
}

async function readJson(request: { json: () => Promise<unknown> }): Promise<unknown> {
  return request.json().catch(() => {
    throw new BadRequestError("Expected a JSON request body");
  });
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const api = app.basePath("/api");

api.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (["POST", "PATCH", "PUT", "DELETE"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin !== undefined && origin !== new URL(c.req.url).origin) {
      return c.json({ error: "Cross-origin writes are disabled" }, 403);
    }
  }
  c.set("tasks", createCloudTaskService(c.env.DB, new URL(c.req.url).origin));
  return next();
});

app.onError((error, c) => {
  if (error instanceof ZodError) {
    return c.json({ error: "Invalid request", details: error.flatten() }, 400);
  }
  if (error instanceof BadRequestError) {
    return c.json({ error: error.message }, 400);
  }
  if (error instanceof NotFoundError) {
    return c.json({ error: error.message }, 404);
  }
  if (error instanceof ConflictError) {
    return c.json({ error: error.message }, 409);
  }
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));
api.get("/health", async (c) => {
  await c.env.DB.prepare("SELECT id FROM tasks LIMIT 1").first();
  return c.json({ ok: true });
});
api.get("/tasks", async (c) => c.json({
  tasks: await c.var.tasks.listTasks({ parentTaskId: c.req.query("parentTaskId") ?? null })
}));
api.post("/tasks", async (c) => c.json({
  task: await c.var.tasks.createTask(parseCreateTaskInput(await readJson(c.req)))
}, 201));
api.get("/tasks/:id", async (c) => c.json({
  task: await c.var.tasks.getTask(c.req.param("id"))
}));
api.patch("/tasks/:id", async (c) => c.json({
  task: await c.var.tasks.updateTask(c.req.param("id"), parseUpdateTaskInput(await readJson(c.req)))
}));
api.get("/tasks/:id/children", async (c) => c.json({
  tasks: await c.var.tasks.listChildren(c.req.param("id"))
}));
api.get("/actions", async (c) => c.json({ actions: await c.var.tasks.listActionSettings() }));
api.patch("/actions/:actionId", async (c) => c.json({
  action: await c.var.tasks.updateActionSettings(c.req.param("actionId"),
    parseUpdateTaskActionInput(await readJson(c.req)))
}));
api.get("/tasks/:id/actions", async (c) => c.json({
  actions: await c.var.tasks.listActions(c.req.param("id"))
}));
api.get("/tasks/:id/resources", async (c) => c.json({
  resources: await c.var.tasks.getResources(c.req.param("id"))
}));
api.get("/tasks/:id/sessions", async (c) => c.json({
  sessions: await c.var.tasks.listSessions(c.req.param("id"))
}));
api.post("/tasks/:id/sessions", async (c) => c.json({
  session: await c.var.tasks.addSession(c.req.param("id"), parseCreateSessionInput(await readJson(c.req)))
}, 201));
api.patch("/tasks/:id/sessions/:sessionId", async (c) => c.json({
  session: await c.var.tasks.updateSessionContext(c.req.param("id"), c.req.param("sessionId"),
    parseSessionContext(await readJson(c.req)))
}));
api.post("/sessions/:id/claim", async (c) =>
  c.json(await c.var.tasks.claimSession(c.req.param("id"), parseClaimSessionInput(await readJson(c.req))))
);
api.get("/tasks/:id/artifacts", async (c) => c.json({
  artifacts: await c.var.tasks.listArtifacts(c.req.param("id"), {
    includeArchived: c.req.query("includeArchived") === "true"
  })
}));
api.post("/tasks/:id/artifacts", async (c) => c.json({
  artifact: await c.var.tasks.addArtifact(c.req.param("id"), parseCreateArtifactInput(await readJson(c.req)))
}, 201));
api.get("/tasks/:id/pull-requests", async (c) => c.json({
  pullRequests: await c.var.tasks.listPullRequests(c.req.param("id"))
}));
api.post("/tasks/:id/pull-requests", async (c) => c.json({
  pullRequest: await c.var.tasks.addPullRequest(
    c.req.param("id"),
    parseCreatePullRequestInput(await readJson(c.req))
  )
}, 201));
api.get("/tasks/:id/tickets", async (c) => c.json({
  tickets: await c.var.tasks.listTickets(c.req.param("id"))
}));
api.post("/tasks/:id/tickets", async (c) => c.json({
  ticket: await c.var.tasks.addTicket(c.req.param("id"), parseCreateTicketInput(await readJson(c.req)))
}, 201));

app.all("/api", (c) => c.json({ error: "Endpoint unavailable in hosted Tasker" }, 404));
app.all("/api/*", (c) => c.json({ error: "Endpoint unavailable in hosted Tasker" }, 404));

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
