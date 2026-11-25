import assert from "node:assert/strict";
import test from "node:test";
import { ZodError } from "zod";
import { parseTaskMemorySearchQuery } from "../command/task-memory-search.command.js";
import type {
  TaskMemoryEmbeddingProvider,
  TaskMemorySearchCandidate,
  TaskMemorySearchRepository
} from "../domain/task-memory-search.js";
import {
  chunkText,
  TaskMemorySearchService,
  toFtsExpression
} from "./task-memory-search.js";

void test("search query parsing bounds lengths and limits", () => {
  assert.deepEqual(parseTaskMemorySearchQuery({ q: " latency " }), {
    limit: 12,
    query: "latency"
  });
  assert.deepEqual(parseTaskMemorySearchQuery({ q: "a unicode café", limit: "20" }), {
    limit: 20,
    query: "a unicode café"
  });
  assert.throws(
    () => parseTaskMemorySearchQuery({ q: "x".repeat(241) }),
    ZodError
  );
  assert.throws(() => parseTaskMemorySearchQuery({ q: "query", limit: "0" }), ZodError);
  assert.throws(() => parseTaskMemorySearchQuery({ q: "query", limit: "1e2" }), ZodError);
  assert.throws(() => parseTaskMemorySearchQuery({ q: "  " }), ZodError);
});

void test("FTS expressions quote user syntax and retain exact identifiers", () => {
  assert.equal(
    toFtsExpression('task_session_messages" OR *'),
    '"task_session_messages"" OR *" OR ("task_session_messages")'
  );
  assert.equal(
    toFtsExpression("café ☕ résumé"),
    '"café ☕ résumé" OR ("café" AND "résumé")'
  );
  assert.equal(
    toFtsExpression("best recipe for pistachio gelato"),
    '"best recipe for pistachio gelato" OR ("best" AND "recipe" AND "pistachio" AND "gelato")'
  );
  assert.equal(toFtsExpression("☕—"), '"__tasker_no_fts_tokens__"');
});

void test("long Unicode messages are split into bounded overlapping passages", () => {
  const text = "A paragraph about the request path and response startup. ".repeat(120)
    + "🧭 final marker SESSION_WAKE_GRACE_MS";
  const chunks = chunkText(text);

  assert.ok(chunks.length > 10);
  assert.ok(chunks.every((chunk) => chunk.length <= 480));
  assert.ok(chunks.some((chunk) => chunk.includes("🧭")));
  assert.ok(chunks.at(-1)?.includes("SESSION_WAKE_GRACE_MS"));
  assert.ok(chunks.every((chunk) => !chunk.includes("\uFFFD")));
});

void test("hybrid search fuses ranks, deduplicates a session, and thresholds noise", async () => {
  const chunkOne = candidate({
    body: "The first command waits for the machine to wake.",
    messageId: "message-a",
    sessionId: "session-a",
    sourceType: "message",
    vectorId: "message:message-a:0"
  });
  const chunkTwo = candidate({
    body: "The first command waits for the machine to wake.",
    messageId: "message-a",
    sessionId: "session-a",
    sourceType: "message",
    vectorId: "message:message-a:1"
  });
  const unrelated = candidate({
    semanticSimilarity: 0.37,
    sessionId: "session-unrelated",
    sourceType: "session_title",
    title: "Unrelated record",
    vectorId: "session:session-unrelated:title"
  });
  const service = new TaskMemorySearchService(
    repository({
      lexicalSearch: () => [chunkOne, chunkTwo],
      vectorSearch: () => [
        { ...chunkTwo, semanticSimilarity: 0.81 },
        { ...unrelated, semanticSimilarity: 0.22 }
      ]
    }),
    embeddings()
  );

  const response = await service.search({ limit: 10, query: "cold machine startup" });
  assert.equal(response.mode, "hybrid");
  assert.equal(response.semanticStatus, "ready");
  assert.deepEqual(
    response.results.map((result) => result.sessionId),
    ["session-a"]
  );
  assert.equal(response.results[0]?.messageId, "message-a");
});

void test("semantic threshold excludes weak nearest-neighbor matches", async () => {
  const weakMatch = candidate({
    semanticSimilarity: 0.519,
    sessionId: "session-weak",
    sourceType: "session_title",
    title: "Weak neighbor",
    vectorId: "session:session-weak:title"
  });
  const relevant = candidate({
    semanticSimilarity: 0.52,
    sessionId: "session-relevant",
    sourceType: "session_title",
    title: "Relevant session",
    vectorId: "session:session-relevant:title"
  });
  const service = new TaskMemorySearchService(
    repository({ vectorSearch: () => [weakMatch, relevant] }),
    embeddings()
  );

  const response = await service.search({ limit: 10, query: "specific topic" });

  assert.deepEqual(
    response.results.map((result) => result.sessionId),
    ["session-relevant"]
  );
});

void test("task results do not displace two relevant sessions from the same task", async () => {
  const taskTitle = candidate({
    semanticSimilarity: 0.82,
    sessionId: null,
    sourceType: "task_title",
    title: "Relevant task",
    vectorId: "task:task-a"
  });
  const firstSession = candidate({
    semanticSimilarity: 0.81,
    sessionId: "session-a",
    sourceType: "session_title",
    title: "First relevant session",
    vectorId: "session:session-a:title"
  });
  const secondSession = candidate({
    semanticSimilarity: 0.8,
    sessionId: "session-b",
    sourceType: "session_title",
    title: "Second relevant session",
    vectorId: "session:session-b:title"
  });
  const thirdSession = candidate({
    semanticSimilarity: 0.79,
    sessionId: "session-c",
    sourceType: "session_title",
    title: "Third relevant session",
    vectorId: "session:session-c:title"
  });
  const service = new TaskMemorySearchService(
    repository({
      vectorSearch: () => [
        taskTitle,
        firstSession,
        secondSession,
        thirdSession
      ]
    }),
    embeddings()
  );

  const response = await service.search({ limit: 10, query: "related query" });

  assert.deepEqual(
    new Set(response.results.map((result) => result.sessionId ?? result.taskId)),
    new Set(["task-a", "session-a", "session-b", "session-c"])
  );
});

void test("relevant session context lifts its task title into the result set", async () => {
  const taskTitle = candidate({
    semanticSimilarity: 0.55,
    sessionId: null,
    sourceType: "task_title",
    title: "Task matching a saved conversation",
    vectorId: "task:task-a"
  });
  const relatedSession = candidate({
    semanticSimilarity: 0.8,
    sessionId: "session-a",
    sourceType: "session_title",
    title: "Strongly matching conversation",
    vectorId: "session:session-a:title"
  });
  const weakerMatches = Array.from({ length: 12 }, (_, index) =>
    candidate({
      semanticSimilarity: 0.1,
      sessionId: `session-noise-${String(index)}`,
      sourceType: "session_title",
      taskId: `task-noise-${String(index)}`,
      title: "Weaker neighbor",
      vectorId: `session:session-noise-${String(index)}:title`
    })
  );
  const service = new TaskMemorySearchService(
    repository({
      vectorSearch: () => [
        relatedSession,
        ...weakerMatches,
        taskTitle
      ]
    }),
    embeddings()
  );

  const response = await service.search({ limit: 10, query: "specific topic" });

  assert.deepEqual(
    response.results.slice(0, 2).map((result) => result.sessionId ?? result.taskId),
    ["session-a", "task-a"]
  );
});

void test("semantic provider failure is reported as lexical-only", async () => {
  const lexical = candidate({
    sourceType: "task_title",
    title: "Slow startup task",
    vectorId: "task:task-a"
  });
  const service = new TaskMemorySearchService(
    repository({ lexicalSearch: () => [lexical] }),
    {
      model: "test-unavailable",
      embed: () => Promise.reject(new Error("provider failure"))
    }
  );

  const response = await service.search({ limit: 5, query: "slow startup" });
  assert.equal(response.mode, "lexical");
  assert.equal(response.semanticStatus, "degraded");
  assert.equal(response.results.length, 1);
});

function repository(
  overrides: Partial<TaskMemorySearchRepository> = {}
): TaskMemorySearchRepository {
  return {
    claimJobs: () => [],
    completeJob: () => undefined,
    deleteSource: () => undefined,
    failJob: () => undefined,
    getIndexStatus: () => ({ indexedDocuments: 3, pendingJobs: 0 }),
    getSource: () => null,
    lexicalSearch: () => [],
    persistDocuments: () => undefined,
    vectorSearch: () => [],
    ...overrides
  };
}

function embeddings(): TaskMemoryEmbeddingProvider {
  return {
    model: "test-model",
    embed: (texts) =>
      Promise.resolve(texts.map(() => new Float32Array([1, 0, 0])))
  };
}

function candidate(
  overrides: Partial<TaskMemorySearchCandidate> = {}
): TaskMemorySearchCandidate {
  return {
    body: "The first request waited while the server initialized.",
    messageId: null,
    messageOrdinal: null,
    messageRole: null,
    parentTaskId: null,
    semanticSimilarity: null,
    sessionId: null,
    sessionSourceUrl: null,
    sessionTitle: null,
    sourceType: "message",
    taskId: "task-a",
    taskTitle: "Generic task",
    title: "",
    vectorId: "message:message-a:0",
    ...overrides
  };
}
