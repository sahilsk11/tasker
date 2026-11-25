import assert from "node:assert/strict";
import test from "node:test";
import type { TaskMemorySearchService } from "./task-memory-search.js";
import { TaskMemoryIndexWorker } from "./task-memory-index-worker.js";

void test("index worker reports sanitized infrastructure failures and retries", async () => {
  const logs: unknown[][] = [];
  let reportFailure!: () => void;
  const reported = new Promise<void>((resolve) => {
    reportFailure = resolve;
  });
  const logger = {
    error: (...values: unknown[]) => {
      logs.push(values);
      reportFailure();
    }
  };
  const search = {
    processPendingJobs: () =>
      Promise.reject(new Error("sensitive transcript and credential"))
  } as unknown as TaskMemorySearchService;
  const worker = new TaskMemoryIndexWorker(search, logger);

  try {
    worker.start();
    const timeout = setTimeout(() => {
      throw new Error("Worker did not report its failure");
    }, 2_000);
    try {
      await reported;
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    await worker.close();
  }

  assert.deepEqual(logs, [[
    "Task memory index worker failed; retry scheduled",
    { errorName: "Error" }
  ]]);
  assert.equal(JSON.stringify(logs).includes("sensitive transcript"), false);
});
