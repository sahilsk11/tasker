import { requireLoopbackApiUrl } from "./api-url.mjs";

const INDEXING_DEADLINE_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const STATUS_POLL_INTERVAL_MS = 500;

export function createTaskerApiAdapter({
  apiBaseUrl,
  fetchImpl = fetch,
  indexingDeadlineMs = INDEXING_DEADLINE_MS,
  pollIntervalMs = STATUS_POLL_INTERVAL_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS
}) {
  const baseUrl = requireLoopbackApiUrl(apiBaseUrl, {
    invalidMessage: "Refusing non-loopback API URL",
    missingMessage: "Set TASKER_API_BASE_URL to the API URL printed by pnpm worktree:setup"
  });
  let isIndexed = false;
  let indexingPromise;

  async function waitUntilIndexed() {
    const statusUrl = new URL("/search/status", baseUrl);
    const deadline = Date.now() + indexingDeadlineMs;
    let lastPendingJobs = null;
    let lastIndexedDocuments = null;

    while (Date.now() < deadline) {
      const status = await requestJson(statusUrl, deadline, "GET /search/status");
      lastPendingJobs = status.pendingJobs;
      lastIndexedDocuments = status.indexedDocuments;
      if (status.pendingJobs === 0 && status.indexedDocuments > 0) {
        return;
      }
      await delay(Math.min(pollIntervalMs, deadline - Date.now()));
    }

    throw new Error(
      `Timed out waiting for semantic indexing after ${String(indexingDeadlineMs)} ms; ` +
      `last pending jobs: ${String(lastPendingJobs)}, ` +
      `indexed documents: ${String(lastIndexedDocuments)}`
    );
  }

  async function ensureIndexed() {
    if (isIndexed) {
      return;
    }
    if (indexingPromise == null) {
      indexingPromise = waitUntilIndexed()
        .then(() => {
          isIndexed = true;
        })
        .finally(() => {
          indexingPromise = undefined;
        });
    }
    await indexingPromise;
  }

  async function search(query, context) {
    await ensureIndexed();
    const url = new URL("/search", baseUrl);
    url.searchParams.set("limit", String(Math.min(context.limit, 20)));
    url.searchParams.set("q", query);
    const deadline = Date.now() + requestTimeoutMs;
    const payload = await requestJson(url, deadline, "GET /search");

    if (payload.mode !== "hybrid" || payload.semanticStatus === "degraded") {
      throw new Error("Semantic search is unavailable; refusing a lexical-only evaluation");
    }
    if (payload.pendingJobs !== 0) {
      throw new Error(
        `Semantic index still has ${String(payload.pendingJobs)} pending jobs`
      );
    }
    if (!Array.isArray(payload.results)) {
      throw new Error("GET /search did not return results");
    }

    return payload.results.map((result) => {
      const id = requireMemoryResultId(result);
      return context.resolveId(id) ?? `unknown:${id}`;
    });
  }

  async function requestJson(url, deadline, route) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(`Timed out waiting for ${route}; the overall deadline expired`);
    }
    const timeoutMs = Math.max(1, Math.ceil(Math.min(requestTimeoutMs, remainingMs)));
    const signal = AbortSignal.timeout(timeoutMs);

    try {
      const response = await fetchImpl(url, {
        redirect: "error",
        signal
      });
      if (!response.ok) {
        throw new SearchApiResponseError(`${route} returned ${String(response.status)}`);
      }
      try {
        return await response.json();
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }
        throw new SearchApiResponseError(
          `${route} returned invalid JSON (${errorName(error)})`
        );
      }
    } catch (error) {
      if (error instanceof SearchApiResponseError) {
        throw error;
      }
      if (signal.aborted) {
        throw new Error(`${route} timed out after ${String(timeoutMs)} ms`);
      }
      throw new Error(`${route} request failed (${errorName(error)})`);
    }
  }

  return { search, waitUntilIndexed };
}

export function requireMemoryResultId(result) {
  if (
    result == null ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    result.artifactId != null ||
    result.artifact_id != null
  ) {
    throw new Error("Unsupported memory search result identity");
  }

  if (result.sourceType === "task_title") {
    if (typeof result.taskId !== "string" || result.taskId.length === 0) {
      throw new Error("Task-title search result is missing its task id");
    }
    if (result.sessionId != null) {
      throw new Error("Task-title search result has an invalid session id");
    }
    return result.taskId;
  }

  if (result.sourceType === "session_title" || result.sourceType === "message") {
    if (
      typeof result.sessionId !== "string" ||
      result.sessionId.length === 0 ||
      typeof result.taskId !== "string" ||
      result.taskId.length === 0
    ) {
      throw new Error("Session search result is missing its memory identity");
    }
    return result.sessionId;
  }

  throw new Error(
    `Unsupported memory search result source type: ${String(result.sourceType)}`
  );
}

let defaultAdapter;

export function search(query, context) {
  return getDefaultAdapter().search(query, context);
}

export function waitUntilIndexed() {
  return getDefaultAdapter().waitUntilIndexed();
}

function getDefaultAdapter() {
  if (defaultAdapter == null) {
    defaultAdapter = createTaskerApiAdapter({
      apiBaseUrl: process.env.TASKER_API_BASE_URL
    });
  }
  return defaultAdapter;
}

function errorName(error) {
  return error instanceof Error ? error.name : "UnknownError";
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

class SearchApiResponseError extends Error {}
