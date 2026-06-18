import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createApp } from "../app.js";
import { taskStateDefinitions } from "../domain/task.js";

void test("task state options are exposed in canonical order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-state-options-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/task-states"
    });

    assert.equal(response.statusCode, 200);
    const body = readJson(response.body) as {
      readonly states: typeof taskStateDefinitions;
    };
    assert.deepEqual(body.states, taskStateDefinitions);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("artifact and pull request endpoints infer task state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-resource-state-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const task = await createTask(app, "State inference");
    assert.equal(task.state, "ready");

    const research = await createArtifact(app, task.id, {
      label: "research",
      uri: "/tmp/research.md"
    });
    assert.equal(research.label, "research");
    assert.equal(research.taskId, task.id);
    assert.equal(await getTaskState(app, task.id), "scoping");

    await createArtifact(app, task.id, {
      label: "plan",
      uri: "/tmp/plan.md"
    });
    assert.equal(await getTaskState(app, task.id), "planning");

    await createArtifact(app, task.id, {
      label: "implement",
      uri: "/tmp/implementation.md"
    });
    assert.equal(await getTaskState(app, task.id), "implementation");

    const pullRequest = await createPullRequest(app, task.id, {
      url: "https://github.com/sahilsk11/tasker/pull/21"
    });
    assert.equal(pullRequest.taskId, task.id);
    assert.equal(pullRequest.url, "https://github.com/sahilsk11/tasker/pull/21");
    assert.equal(await getTaskState(app, task.id), "implementation");

    await createArtifact(app, task.id, {
      label: "other",
      uri: "/tmp/other.md"
    });
    assert.equal(await getTaskState(app, task.id), "implementation");

    await createArtifact(app, task.id, {
      label: "plan",
      uri: "/tmp/late-plan.md"
    });
    assert.equal(await getTaskState(app, task.id), "implementation");
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("task state can be manually updated", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-manual-state-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const task = await createTask(app, "Manual state");
    const response = await app.inject({
      method: "PATCH",
      payload: { state: "done" },
      url: `/tasks/${task.id}`
    });

    assert.equal(response.statusCode, 200);
    const updated = (readJson(response.body) as {
      readonly task: { readonly id: string; readonly state: string };
    }).task;

    assert.equal(updated.id, task.id);
    assert.equal(updated.state, "done");
    assert.equal(await getTaskState(app, task.id), "done");

    const invalidResponse = await app.inject({
      method: "PATCH",
      payload: { state: "running" },
      url: `/tasks/${task.id}`
    });
    assert.equal(invalidResponse.statusCode, 400);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("task working directory persists on create and update", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-working-directory-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const createResponse = await app.inject({
      method: "POST",
      payload: {
        title: "Working directory task",
        workingDirectory: `  ${dir}  `
      },
      url: "/tasks"
    });
    assert.equal(createResponse.statusCode, 201);
    const created = (readJson(createResponse.body) as {
      readonly task: {
        readonly id: string;
        readonly workingDirectory: string | null;
      };
    }).task;
    assert.equal(created.workingDirectory, dir);

    const readResponse = await app.inject({
      method: "GET",
      url: `/tasks/${created.id}`
    });
    assert.equal(readResponse.statusCode, 200);
    const readTask = (readJson(readResponse.body) as {
      readonly task: { readonly workingDirectory: string | null };
    }).task;
    assert.equal(readTask.workingDirectory, dir);

    const clearResponse = await app.inject({
      method: "PATCH",
      payload: { workingDirectory: "" },
      url: `/tasks/${created.id}`
    });
    assert.equal(clearResponse.statusCode, 200);
    const cleared = (readJson(clearResponse.body) as {
      readonly task: { readonly workingDirectory: string | null };
    }).task;
    assert.equal(cleared.workingDirectory, null);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("task artifacts expose renderable local file content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-artifact-content-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const markdownPath = join(dir, "notes.md");
    const htmlPath = join(dir, "report.html");
    const imagePath = join(dir, "pixel.png");

    await writeFile(markdownPath, "# Notes\n\nBody text.\n");
    await writeFile(htmlPath, "<!doctype html><h1>Report</h1>");
    await writeFile(
      imagePath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        "base64"
      )
    );

    const task = await createTask(app, "Renderable artifacts");

    const markdownArtifact = await createArtifact(app, task.id, {
      label: "other",
      uri: markdownPath
    });
    const htmlArtifact = await createArtifact(app, task.id, {
      label: "other",
      uri: pathToFileURL(htmlPath).href
    });
    const imageArtifact = await createArtifact(app, task.id, {
      label: "other",
      uri: imagePath
    });

    const metadataResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/artifacts/${markdownArtifact.id}`
    });
    assert.equal(metadataResponse.statusCode, 200);
    const metadata = (readJson(metadataResponse.body) as {
      readonly artifact: { readonly id: string; readonly uri: string };
    }).artifact;
    assert.equal(metadata.id, markdownArtifact.id);
    assert.equal(metadata.uri, markdownPath);

    const markdownResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/artifacts/${markdownArtifact.id}/content`
    });
    assert.equal(markdownResponse.statusCode, 200);
    const markdown = readContent(markdownResponse.body);
    assert.equal(markdown.kind, "markdown");
    assert.equal(markdown.encoding, "utf8");
    assert.equal(markdown.content, "# Notes\n\nBody text.\n");

    const htmlResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/artifacts/${htmlArtifact.id}/content`
    });
    assert.equal(htmlResponse.statusCode, 200);
    const html = readContent(htmlResponse.body);
    assert.equal(html.kind, "html");
    assert.equal(html.content, "<!doctype html><h1>Report</h1>");

    const imageResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/artifacts/${imageArtifact.id}/content`
    });
    assert.equal(imageResponse.statusCode, 200);
    const image = readContent(imageResponse.body);
    assert.equal(image.kind, "image");
    assert.equal(image.contentType, "image/png");
    assert.equal(image.encoding, "base64");
    assert.ok(image.content?.startsWith("iVBORw0KGgo"));
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("task resources aggregate and dedupe explicit resource types", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-resource-dedupe-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const task = await createTask(app, "Dedupe resources");
    const otherTask = await createTask(app, "Other task");
    const session = await createSession(app, task.id);
    const otherSession = await createSession(app, otherTask.id);

    const artifactPayload = {
      createdBySessionId: session.id,
      label: "implement",
      uri: "/tmp/tasker-notes.md"
    } as const;
    const firstArtifact = await createArtifact(app, task.id, artifactPayload);
    assert.equal(firstArtifact.createdBySessionId, session.id);

    const duplicateArtifact = await createArtifact(app, task.id, artifactPayload);
    assert.equal(duplicateArtifact.id, firstArtifact.id);
    assert.equal(duplicateArtifact.createdBySessionId, session.id);

    const pullRequestPayload = {
      url: "https://github.com/sahilsk11/tasker/pull/42"
    };
    const firstPullRequest = await createPullRequest(app, task.id, pullRequestPayload);
    const duplicatePullRequest = await createPullRequest(
      app,
      task.id,
      pullRequestPayload
    );
    assert.equal(duplicatePullRequest.id, firstPullRequest.id);

    const ticketPayload = {
      externalId: "SAS-58",
      url: "https://linear.app/example/issue/SAS-58"
    };
    const firstTicketResponse = await app.inject({
      method: "POST",
      payload: ticketPayload,
      url: `/tasks/${task.id}/tickets`
    });
    assert.equal(firstTicketResponse.statusCode, 201);
    const firstTicket = (readJson(firstTicketResponse.body) as {
      readonly ticket: { readonly id: string };
    }).ticket;

    const duplicateTicketResponse = await app.inject({
      method: "POST",
      payload: { ...ticketPayload, url: null },
      url: `/tasks/${task.id}/tickets`
    });
    assert.equal(duplicateTicketResponse.statusCode, 201);
    const duplicateTicket = (readJson(duplicateTicketResponse.body) as {
      readonly ticket: { readonly id: string };
    }).ticket;
    assert.equal(duplicateTicket.id, firstTicket.id);

    const resourcesResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/resources`
    });
    assert.equal(resourcesResponse.statusCode, 200);
    const resources = (readJson(resourcesResponse.body) as {
      readonly resources: {
        readonly artifacts: ReadonlyArray<{ readonly id: string }>;
        readonly pullRequests: ReadonlyArray<{ readonly id: string }>;
        readonly sessions: ReadonlyArray<{ readonly id: string }>;
        readonly tickets: ReadonlyArray<{ readonly id: string }>;
      };
    }).resources;
    assert.equal(resources.artifacts.length, 1);
    assert.equal(resources.pullRequests.length, 1);
    assert.equal(resources.sessions.length, 1);
    assert.equal(resources.tickets.length, 1);

    const wrongSessionResponse = await app.inject({
      method: "POST",
      payload: {
        createdBySessionId: otherSession.id,
        label: "implement",
        uri: "/tmp/wrong-session.md"
      },
      url: `/tasks/${task.id}/artifacts`
    });
    assert.equal(wrongSessionResponse.statusCode, 400);

    const legacyCreateResponse = await app.inject({
      method: "POST",
      payload: {
        kind: "summary",
        label: "Implement notes",
        uri: "/tmp/legacy.md"
      },
      url: `/tasks/${task.id}/resources`
    });
    assert.equal(legacyCreateResponse.statusCode, 404);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

function readJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}

async function createTask(
  app: Awaited<ReturnType<typeof createApp>>,
  title: string
): Promise<{ readonly id: string; readonly state: string }> {
  const response = await app.inject({
    method: "POST",
    payload: { title },
    url: "/tasks"
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as {
    readonly task: { readonly id: string; readonly state: string };
  }).task;
}

async function getTaskState(
  app: Awaited<ReturnType<typeof createApp>>,
  taskId: string
): Promise<string> {
  const response = await app.inject({
    method: "GET",
    url: `/tasks/${taskId}`
  });
  assert.equal(response.statusCode, 200);
  return (readJson(response.body) as {
    readonly task: { readonly state: string };
  }).task.state;
}

async function createArtifact(
  app: Awaited<ReturnType<typeof createApp>>,
  taskId: string,
  payload: {
    readonly createdBySessionId?: string;
    readonly label: "research" | "plan" | "implement" | "other";
    readonly uri: string;
  }
): Promise<{
  readonly createdBySessionId: string | null;
  readonly id: string;
  readonly label: string;
  readonly taskId: string;
}> {
  const response = await app.inject({
    method: "POST",
    payload,
    url: `/tasks/${taskId}/artifacts`
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as {
    readonly artifact: {
      readonly createdBySessionId: string | null;
      readonly id: string;
      readonly label: string;
      readonly taskId: string;
    };
  }).artifact;
}

async function createPullRequest(
  app: Awaited<ReturnType<typeof createApp>>,
  taskId: string,
  payload: { readonly url: string }
): Promise<{ readonly id: string; readonly taskId: string; readonly url: string }> {
  const response = await app.inject({
    method: "POST",
    payload,
    url: `/tasks/${taskId}/pull-requests`
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as {
    readonly pullRequest: {
      readonly id: string;
      readonly taskId: string;
      readonly url: string;
    };
  }).pullRequest;
}

async function createSession(
  app: Awaited<ReturnType<typeof createApp>>,
  taskId: string
): Promise<{ readonly id: string }> {
  const response = await app.inject({
    method: "POST",
    payload: {
      provider: "codex"
    },
    url: `/tasks/${taskId}/sessions`
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as { readonly session: { readonly id: string } })
    .session;
}

function readContent(body: string): {
  readonly content: string | null;
  readonly contentType: string;
  readonly encoding: "base64" | "utf8" | null;
  readonly kind: string;
} {
  return (readJson(body) as {
    readonly content: {
      readonly content: string | null;
      readonly contentType: string;
      readonly encoding: "base64" | "utf8" | null;
      readonly kind: string;
    };
  }).content;
}
