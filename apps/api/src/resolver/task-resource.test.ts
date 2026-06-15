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

function readJson(body: string): unknown {
  return JSON.parse(body) as unknown;
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
