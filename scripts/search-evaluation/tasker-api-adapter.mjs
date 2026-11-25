const baseUrl = requireLoopbackBaseUrl(process.env.TASKER_API_BASE_URL);
await waitUntilIndexed();

export async function search(query, context) {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("limit", String(Math.min(context.limit, 20)));
  url.searchParams.set("q", query);
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) {
    throw new Error(`GET /search returned ${String(response.status)}`);
  }

  const payload = await response.json();
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
    const id = result.sessionId ?? result.taskId;
    return context.resolveId(id) ?? `unknown:${id}`;
  });
}

function requireLoopbackBaseUrl(value) {
  if (value == null || value.trim().length === 0) {
    throw new Error("Set TASKER_API_BASE_URL to the API URL printed by pnpm worktree:setup");
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
    throw new Error("Refusing non-loopback API URL");
  }
  return url;
}

async function waitUntilIndexed() {
  const statusUrl = new URL("/search/status", baseUrl);
  const deadline = Date.now() + 10 * 60_000;
  let lastPendingJobs = null;
  while (Date.now() < deadline) {
    const response = await fetch(statusUrl, { redirect: "error" });
    if (!response.ok) {
      throw new Error(`GET /search/status returned ${String(response.status)}`);
    }
    const status = await response.json();
    lastPendingJobs = status.pendingJobs;
    if (status.pendingJobs === 0 && status.indexedDocuments > 0) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(
    `Timed out waiting for semantic indexing; pending jobs: ${String(lastPendingJobs)}`
  );
}
