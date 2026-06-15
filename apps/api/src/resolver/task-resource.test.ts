import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createApp } from "../app.js";

void test("task resources can register PR links", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-resource-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const taskResponse = await app.inject({
      method: "POST",
      payload: {
        title: "Resource registration"
      },
      url: "/tasks"
    });
    assert.equal(taskResponse.statusCode, 201);
    const task = (readJson(taskResponse.body) as {
      readonly task: { readonly id: string };
    }).task;

    const createResourceResponse = await app.inject({
      method: "POST",
      payload: {
        kind: "pr",
        label: "Implementation PR",
        uri: "https://github.com/sahilsk11/tasker/pull/21"
      },
      url: `/tasks/${task.id}/resources`
    });
    assert.equal(createResourceResponse.statusCode, 201);
    const resource = (readJson(createResourceResponse.body) as {
      readonly resource: {
        readonly id: string;
        readonly kind: string;
        readonly label: string;
        readonly taskId: string;
        readonly uri: string;
      };
    }).resource;
    assert.equal(resource.kind, "pr");
    assert.equal(resource.label, "Implementation PR");
    assert.equal(resource.taskId, task.id);
    assert.equal(resource.uri, "https://github.com/sahilsk11/tasker/pull/21");

    const resourcesResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/resources`
    });
    assert.equal(resourcesResponse.statusCode, 200);
    const resources = (readJson(resourcesResponse.body) as {
      readonly resources: {
        readonly artifacts: ReadonlyArray<{
          readonly id: string;
          readonly kind: string;
          readonly label: string;
          readonly taskId: string;
          readonly uri: string;
        }>;
      };
    }).resources;
    assert.equal(resources.artifacts.length, 1);
    const artifact = resources.artifacts[0];
    assert.ok(artifact);
    assert.equal(artifact.id, resource.id);
    assert.equal(artifact.kind, "pr");
    assert.equal(artifact.label, "Implementation PR");
    assert.equal(artifact.taskId, task.id);
    assert.equal(
      artifact.uri,
      "https://github.com/sahilsk11/tasker/pull/21"
    );
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

    const taskResponse = await app.inject({
      method: "POST",
      payload: {
        title: "Renderable artifacts"
      },
      url: "/tasks"
    });
    assert.equal(taskResponse.statusCode, 201);
    const task = (readJson(taskResponse.body) as {
      readonly task: { readonly id: string };
    }).task;

    const markdownArtifact = await createArtifact(app, task.id, {
      kind: "summary",
      label: "Notes",
      uri: markdownPath
    });
    const htmlArtifact = await createArtifact(app, task.id, {
      kind: "report",
      label: "Report",
      uri: pathToFileURL(htmlPath).href
    });
    const imageArtifact = await createArtifact(app, task.id, {
      kind: "screenshot",
      label: "Screenshot",
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

void test("task resources dedupe repeated registrations and track session attribution", async () => {
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
      kind: "summary",
      label: "Implement notes",
      uri: "/tmp/tasker-notes.md"
    };
    const firstArtifactResponse = await app.inject({
      method: "POST",
      payload: artifactPayload,
      url: `/tasks/${task.id}/resources`
    });
    assert.equal(firstArtifactResponse.statusCode, 201);
    const firstArtifact = (readJson(firstArtifactResponse.body) as {
      readonly resource: {
        readonly createdBySessionId: string | null;
        readonly id: string;
        readonly label: string;
      };
    }).resource;
    assert.equal(firstArtifact.createdBySessionId, session.id);

    const duplicateArtifactResponse = await app.inject({
      method: "POST",
      payload: { ...artifactPayload, label: "Duplicate notes" },
      url: `/tasks/${task.id}/resources`
    });
    assert.equal(duplicateArtifactResponse.statusCode, 201);
    const duplicateArtifact = (readJson(duplicateArtifactResponse.body) as {
      readonly resource: {
        readonly createdBySessionId: string | null;
        readonly id: string;
        readonly label: string;
      };
    }).resource;
    assert.equal(duplicateArtifact.id, firstArtifact.id);
    assert.equal(duplicateArtifact.label, "Implement notes");
    assert.equal(duplicateArtifact.createdBySessionId, session.id);

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
        readonly tickets: ReadonlyArray<{ readonly id: string }>;
      };
    }).resources;
    assert.equal(resources.artifacts.length, 1);
    assert.equal(resources.tickets.length, 1);

    const wrongSessionResponse = await app.inject({
      method: "POST",
      payload: {
        createdBySessionId: otherSession.id,
        kind: "summary",
        label: "Wrong session",
        uri: "/tmp/wrong-session.md"
      },
      url: `/tasks/${task.id}/resources`
    });
    assert.equal(wrongSessionResponse.statusCode, 400);
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
): Promise<{ readonly id: string }> {
  const response = await app.inject({
    method: "POST",
    payload: { title },
    url: "/tasks"
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as { readonly task: { readonly id: string } }).task;
}

async function createArtifact(
  app: Awaited<ReturnType<typeof createApp>>,
  taskId: string,
  payload: { readonly kind: string; readonly label: string; readonly uri: string }
): Promise<{ readonly id: string }> {
  const response = await app.inject({
    method: "POST",
    payload,
    url: `/tasks/${taskId}/artifacts`
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as { readonly artifact: { readonly id: string } })
    .artifact;
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
