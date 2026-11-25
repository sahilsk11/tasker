import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { coreTasks, makeDistractors } from "./corpus.mjs";

const options = parseArgs(process.argv.slice(2));
const baseUrl = requireLocalApiUrl(process.env.TASKER_API_BASE_URL);
const mapPath = resolve(
  options.mapOut ?? ".tasker/dev-runs/search-evaluation-seed-map.json"
);
const generatedTasks = makeDistractors(options.distractors);
const tasks = [...coreTasks, ...generatedTasks];
const taskIds = {};
const sessionIds = {};
const refsById = {};
const existing = await request("/tasks");

if (!Array.isArray(existing.tasks)) {
  throw new Error("GET /tasks did not return a tasks array");
}
if (existing.tasks.length > 0) {
  throw new Error(
    `Refusing to seed a non-empty database (${String(existing.tasks.length)} tasks). ` +
    "Start a fresh environment with pnpm worktree:setup."
  );
}

for (const task of tasks) {
  const taskResponse = await request("/tasks", "POST", { title: task.title });
  const taskId = requireId(taskResponse.task, "task");
  taskIds[task.label] = taskId;
  refsById[taskId] = `task:${task.label}`;

  for (const session of task.sessions) {
    const sessionResponse = await request(`/tasks/${encodeURIComponent(taskId)}/sessions`, "POST", {
      clientName: "Search Evaluation",
      displayTitle: session.title,
      provider: "search-evaluation-fixture",
      providerId: session.label
    });
    const sessionId = requireId(sessionResponse.session, "session");
    sessionIds[session.label] = sessionId;
    refsById[sessionId] = `session:${session.label}`;

    if (session.messages.length > 0) {
      await request(
        `/sessions/${encodeURIComponent(sessionId)}/messages`,
        "POST",
        {
          messages: session.messages.map((message, ordinal) => ({
            externalId: `${session.label}-message-${String(ordinal + 1)}`,
            ordinal,
            role: message.role,
            text: message.text
          }))
        }
      );
    }
  }
}

const map = {
  createdAt: new Date().toISOString(),
  counts: {
    distractorSessions: options.distractors,
    messages: tasks.reduce((sum, task) => sum + task.sessions.reduce(
      (sessionSum, session) => sessionSum + session.messages.length,
      0
    ), 0),
    sessions: Object.keys(sessionIds).length,
    tasks: Object.keys(taskIds).length
  },
  ids: {
    sessions: sessionIds,
    tasks: taskIds
  },
  refsById
};

await mkdir(dirname(mapPath), { recursive: true });
await writeFile(mapPath, `${JSON.stringify(map, null, 2)}\n`);
console.info(JSON.stringify({
  apiBaseUrl: baseUrl.href,
  counts: map.counts,
  mapPath
}, null, 2));

function parseArgs(args) {
  const parsed = { distractors: 0, mapOut: null };

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];

    if (option === "--distractors") {
      const count = Number(value);
      if (!Number.isSafeInteger(count) || count < 0 || count > 10_000) {
        throw new Error("--distractors must be an integer from 0 through 10000");
      }
      parsed.distractors = count;
      index += 1;
    } else if (option === "--map-out") {
      if (value == null || value.startsWith("--")) {
        throw new Error("--map-out requires a file path");
      }
      parsed.mapOut = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${String(option)}`);
    }
  }

  return parsed;
}

function requireLocalApiUrl(value) {
  if (value == null || value.trim().length === 0) {
    throw new Error("Set TASKER_API_BASE_URL to the local API URL printed by pnpm worktree:setup");
  }

  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("Refusing non-local API URL; only a loopback HTTP origin is allowed");
  }

  return url;
}

async function request(path, method = "GET", body) {
  const response = await fetch(new URL(path, baseUrl), {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: body === undefined ? {} : { "content-type": "application/json" },
    method,
    redirect: "error"
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `${method} ${path} returned ${String(response.status)}: ${responseBody}`
    );
  }

  return response.json();
}

function requireId(value, entity) {
  if (typeof value?.id !== "string" || value.id.length === 0) {
    throw new Error(`API response did not include a ${entity} id`);
  }
  return value.id;
}
