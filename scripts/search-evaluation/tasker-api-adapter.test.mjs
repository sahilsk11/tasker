import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createTaskerApiAdapter } from "./tasker-api-adapter.mjs";
import { fileURLToPath } from "node:url";
import { goldenQueries } from "./golden-queries.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const adapterPath = resolve(repositoryRoot, "scripts/search-evaluation/tasker-api-adapter.mjs");
const evaluatorPath = resolve(repositoryRoot, "scripts/search-evaluation/evaluate.mjs");

void test("artifact payload with a seeded task id fails evaluation", async () => {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (path === "/search/status") {
      writeJson(response, { indexedDocuments: 1, pendingJobs: 0 });
      return;
    }
    writeJson(response, {
      indexedDocuments: 1,
      mode: "hybrid",
      pendingJobs: 0,
      results: [{ artifactId: "artifact-1", sourceType: "artifact", taskId: "task-1" }],
      semanticStatus: "ready"
    });
  });
  const baseUrl = await listen(server);
  const directory = await mkdtemp(join(tmpdir(), "tasker-search-evaluation-"));
  const mapPath = join(directory, "map.json");

  try {
    await writeFile(
      mapPath,
      JSON.stringify({
        ids: {
          sessions: {},
          tasks: { seeded_task: "task-1" }
        }
      })
    );
    const result = await runEvaluator(mapPath, baseUrl);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Unsupported memory search result identity/);
  } finally {
    await close(server);
    await rm(directory, { force: true, recursive: true });
  }
});

void test("legacy reverse-ID seed maps remain validated and supported", async () => {
  const references = new Map();
  for (const query of goldenQueries) {
    for (const group of query.relevantGroups) {
      for (const ref of group) {
        if (!references.has(ref)) {
          references.set(ref, `memory-${String(references.size + 1)}`);
        }
      }
    }
  }
  const legacyRefsById = Object.fromEntries(
    [...references].map(([ref, id]) => [id, ref])
  );
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/search/status") {
      writeJson(response, { indexedDocuments: references.size, pendingJobs: 0 });
      return;
    }
    const query = goldenQueries.find((item) => item.query === url.searchParams.get("q"));
    assert.ok(query, "evaluator should only request fixture queries");
    const refs = query.noMatch
      ? []
      : query.relevantGroups.map((group) => group[0]);
    writeJson(response, {
      mode: "hybrid",
      pendingJobs: 0,
      results: refs.map((ref) => {
        const [kind] = ref.split(":");
        const id = references.get(ref);
        return kind === "task"
          ? { sourceType: "task_title", taskId: id }
          : { sourceType: "session_title", sessionId: id, taskId: "parent-task" };
      }),
      semanticStatus: "ready"
    });
  });
  const baseUrl = await listen(server);
  const directory = await mkdtemp(join(tmpdir(), "tasker-search-evaluation-"));
  const mapPath = join(directory, "legacy-map.json");

  try {
    await writeFile(mapPath, JSON.stringify({ refsById: legacyRefsById }));
    const result = await runEvaluator(mapPath, baseUrl);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "pass");
  } finally {
    await close(server);
    await rm(directory, { force: true, recursive: true });
  }
});

void test("invalid legacy reverse-ID maps are rejected", async () => {
  const server = createServer((request, response) => {
    writeJson(response, { indexedDocuments: 1, pendingJobs: 0 });
  });
  const baseUrl = await listen(server);
  const directory = await mkdtemp(join(tmpdir(), "tasker-search-evaluation-"));
  const mapPath = join(directory, "invalid-legacy-map.json");

  try {
    await writeFile(
      mapPath,
      JSON.stringify({ refsById: { "task-1": { ref: "task:task_latency" } } })
    );
    const result = await runEvaluator(mapPath, baseUrl);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Seed map contains an invalid or duplicate memory reference/);
  } finally {
    await close(server);
    await rm(directory, { force: true, recursive: true });
  }
});

void test("search status requests finish when the server never responds", async () => {
  const server = createServer(() => {
    // Leave the response open to reproduce a server that accepts but never replies.
  });
  const baseUrl = await listen(server);

  try {
    const adapter = createTaskerApiAdapter({
      apiBaseUrl: baseUrl,
      indexingDeadlineMs: 300,
      requestTimeoutMs: 60
    });
    await assert.rejects(
      adapter.waitUntilIndexed(),
      /GET \/search\/status timed out after 60 ms/
    );
  } finally {
    await close(server);
  }
});

void test("status response bodies obey the indexing deadline", async () => {
  const server = createServer((request, response) => {
    assert.equal(request.url, "/search/status");
    response.writeHead(200, { "content-type": "application/json" });
    response.flushHeaders();
  });
  const baseUrl = await listen(server);

  try {
    const adapter = createTaskerApiAdapter({
      apiBaseUrl: baseUrl,
      indexingDeadlineMs: 60,
      requestTimeoutMs: 500
    });
    const startedAt = Date.now();
    await assert.rejects(
      adapter.waitUntilIndexed(),
      /GET \/search\/status timed out after 60 ms/
    );
    assert.ok(Date.now() - startedAt < 1_000);
  } finally {
    await close(server);
  }
});

void test("search response bodies have a finite request timeout", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/search/status") {
      writeJson(response, { indexedDocuments: 1, pendingJobs: 0 });
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.flushHeaders();
  });
  const baseUrl = await listen(server);

  try {
    const adapter = createTaskerApiAdapter({
      apiBaseUrl: baseUrl,
      requestTimeoutMs: 60
    });
    await assert.rejects(
      adapter.search("query", { limit: 10, resolveId: () => null }),
      /GET \/search timed out after 60 ms/
    );
  } finally {
    await close(server);
  }
});

function writeJson(response, value) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${String(address.port)}`;
}

async function close(server) {
  server.closeAllConnections();
  if (server.listening) {
    server.close();
    await once(server, "close");
  }
}

async function runEvaluator(mapPath, baseUrl) {
  const child = spawn(
    process.execPath,
    [
      evaluatorPath,
      "--adapter",
      adapterPath,
      "--map",
      mapPath,
      "--warm-repeats",
      "0"
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, TASKER_API_BASE_URL: baseUrl },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  const [code] = await once(child, "close");
  return { code, stderr, stdout };
}
