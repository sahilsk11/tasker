import assert from "node:assert/strict";
import test from "node:test";
import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import type {
  TaskMemoryIndexDocument,
  TaskMemorySearchJob
} from "../domain/task-memory-search.js";
import { D1TaskMemorySearchRepository } from "./d1-task-memory-search.repository.js";

void test("D1 indexing fences delayed Vectorize writes and superseded deletes", async () => {
  const oldJob = makeJob("old-lease", "source-old");
  const currentJob = makeJob("current-lease", "source-current");
  const oldDocument = makeDocument("old-generation", "stale source");
  const currentDocument = makeDocument("current-generation", "current source");
  const state = {
    documents: new Map<string, TaskMemoryIndexDocument>(),
    generationToken: oldJob.generationToken,
    leaseToken: oldJob.leaseToken
  };
  const database = createDatabase(state);
  const vectorIds = new Set<string>();
  let signalOldWrite!: () => void;
  let releaseOldWrite!: () => void;
  const oldWriteStarted = new Promise<void>((resolve) => {
    signalOldWrite = resolve;
  });
  const oldWriteGate = new Promise<void>((resolve) => {
    releaseOldWrite = resolve;
  });
  const vectorIndex = {
    upsert: async (vectors: ReadonlyArray<{ readonly id: string }>) => {
      if (vectors.some((vector) => vector.id === oldDocument.vectorId)) {
        signalOldWrite();
        await oldWriteGate;
      }
      for (const vector of vectors) {
        vectorIds.add(vector.id);
      }
    },
    deleteByIds: (ids: readonly string[]) => {
      for (const id of ids) {
        vectorIds.delete(id);
      }
      return Promise.resolve();
    }
  } as unknown as VectorizeIndex;
  const repository = new D1TaskMemorySearchRepository(database, vectorIndex);
  const embedding = new Float32Array(384);
  embedding[0] = 1;

  const staleWrite = repository.persistDocuments(oldJob, [oldDocument], [embedding]);
  await oldWriteStarted;
  state.leaseToken = currentJob.leaseToken;
  state.generationToken = currentJob.generationToken;
  assert.equal(await repository.deleteSource(currentJob), true);

  assert.equal(
    await repository.persistDocuments(currentJob, [currentDocument], [embedding]),
    true
  );
  assert.equal(await repository.deleteSource(oldJob), false);
  releaseOldWrite();
  assert.equal(await staleWrite, false);

  assert.deepEqual([...state.documents.keys()], [currentDocument.vectorId]);
  assert.deepEqual([...vectorIds], [currentDocument.vectorId]);
  assert.notEqual(oldDocument.vectorId, currentDocument.vectorId);
  assert.ok(currentDocument.vectorId.length <= 64);
});

void test("D1 stale same-generation cleanup preserves the current vector", async () => {
  const oldJob = makeJob("old-lease", "source-same");
  const currentJob = makeJob("current-lease", "source-same");
  const document = makeDocument("source-same", "same source");
  const state = {
    documents: new Map<string, TaskMemoryIndexDocument>(),
    generationToken: oldJob.generationToken,
    leaseToken: oldJob.leaseToken
  };
  const database = createDatabase(state);
  const vectorIds = new Set<string>();
  let signalOldWrite!: () => void;
  let releaseOldWrite!: () => void;
  const oldWriteStarted = new Promise<void>((resolve) => {
    signalOldWrite = resolve;
  });
  const oldWriteGate = new Promise<void>((resolve) => {
    releaseOldWrite = resolve;
  });
  let delayFirstWrite = true;
  const vectorIndex = {
    upsert: async (vectors: ReadonlyArray<{ readonly id: string }>) => {
      if (delayFirstWrite) {
        delayFirstWrite = false;
        signalOldWrite();
        await oldWriteGate;
      }
      for (const vector of vectors) {
        vectorIds.add(vector.id);
      }
    },
    deleteByIds: (ids: readonly string[]) => {
      for (const id of ids) {
        vectorIds.delete(id);
      }
      return Promise.resolve();
    }
  } as unknown as VectorizeIndex;
  const repository = new D1TaskMemorySearchRepository(database, vectorIndex);
  const embedding = new Float32Array(384);
  embedding[0] = 1;

  const staleWrite = repository.persistDocuments(oldJob, [document], [embedding]);
  await oldWriteStarted;
  state.leaseToken = currentJob.leaseToken;
  assert.equal(
    await repository.persistDocuments(currentJob, [document], [embedding]),
    true
  );
  releaseOldWrite();
  assert.equal(await staleWrite, false);

  assert.deepEqual([...state.documents.keys()], [document.vectorId]);
  assert.deepEqual([...vectorIds], [document.vectorId]);
});

void test("D1 source cleanup preserves documents from the active generation", async () => {
  const job = makeJob("current-lease", "source-current");
  const document = makeDocument("source-current", "current source");
  const state = {
    documents: new Map([[document.vectorId, document]]),
    generationToken: job.generationToken,
    leaseToken: job.leaseToken
  };
  const database = createDatabase(state);
  const vectorIds = new Set([document.vectorId]);
  let deleteCalls = 0;
  const vectorIndex = {
    upsert: () => Promise.resolve(),
    deleteByIds: (ids: readonly string[]) => {
      deleteCalls += 1;
      for (const id of ids) {
        vectorIds.delete(id);
      }
      return Promise.resolve();
    }
  } as unknown as VectorizeIndex;
  const repository = new D1TaskMemorySearchRepository(database, vectorIndex);

  assert.equal(await repository.deleteSource(job), true);
  assert.equal(deleteCalls, 0);
  assert.deepEqual([...state.documents.keys()], [document.vectorId]);
  assert.deepEqual([...vectorIds], [document.vectorId]);
});

type FakeRepositoryState = {
  readonly documents: Map<string, TaskMemoryIndexDocument>;
  generationToken: string;
  leaseToken: string;
};

class FakeD1Statement {
  private values: unknown[] = [];

  public constructor(
    private readonly query: string,
    private readonly state: FakeRepositoryState
  ) {}

  public bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  public first(): Promise<{ readonly active: number } | { readonly referenced: number } | null> {
    if (this.query.includes("UNION ALL")) {
      const [jobKey, generationToken, ...vectorIds] = this.values;
      assert.equal(jobKey, "message:message-1");
      const referenced = this.state.generationToken === generationToken ||
        [...this.state.documents.keys()].some((id) => vectorIds.includes(id));
      return Promise.resolve(referenced ? { referenced: 1 } : null);
    }
    const [jobKey, leaseToken, generationToken] = this.values;
    assert.equal(jobKey, "message:message-1");
    return Promise.resolve(
      this.state.leaseToken === leaseToken &&
        this.state.generationToken === generationToken
        ? { active: 1 }
        : null
    );
  }

  public all(): Promise<{ readonly results: ReadonlyArray<{ readonly vector_id: string }> }> {
    assert.match(this.query, /^SELECT vector_id/);
    const [messageId] = this.values;
    const results = [...this.state.documents.values()]
      .filter((document) => document.messageId === messageId)
      .map((document) => ({ vector_id: document.vectorId }));
    return Promise.resolve({ results });
  }

  public run(): Promise<{ readonly meta: { readonly changes: number } }> {
    assert.match(this.query, /^DELETE FROM task_memory_search_documents/);
    const [messageId, ...values] = this.values;
    const [jobKey, leaseToken, generationToken] = values.slice(-3);
    const vectorIds = values.slice(0, -3);
    if (
      jobKey !== "message:message-1" ||
      this.state.leaseToken !== leaseToken ||
      this.state.generationToken !== generationToken
    ) {
      return Promise.resolve({ meta: { changes: 0 } });
    }
    let changes = 0;
    for (const [vectorId, document] of this.state.documents) {
      if (document.messageId === messageId && vectorIds.includes(vectorId)) {
        this.state.documents.delete(vectorId);
        changes += 1;
      }
    }
    return Promise.resolve({ meta: { changes } });
  }

  public get boundValues(): readonly unknown[] {
    return this.values;
  }
}

function createDatabase(state: FakeRepositoryState): D1Database {
  return {
    prepare: (query: string) => new FakeD1Statement(query, state),
    batch: (statements: readonly FakeD1Statement[]) =>
      Promise.resolve(statements.map((statement) => {
        const [
          vectorId,
          taskId,
          sessionId,
          messageId,
          sourceType,
          messageRole,
          messageOrdinal,
          title,
          body,
          jobKey,
          leaseToken,
          generationToken
        ] = statement.boundValues;
        if (
          jobKey !== "message:message-1" ||
          state.leaseToken !== leaseToken ||
          state.generationToken !== generationToken
        ) {
          return { meta: { changes: 0 } };
        }
        state.documents.set(String(vectorId), {
          body: String(body),
          embeddingText: "",
          messageId: String(messageId),
          messageOrdinal: Number(messageOrdinal),
          messageRole: String(messageRole),
          sessionId: String(sessionId),
          sourceType: sourceType as TaskMemoryIndexDocument["sourceType"],
          taskId: String(taskId),
          title: String(title),
          vectorId: String(vectorId)
        });
        return { meta: { changes: 1 } };
      }))
  } as unknown as D1Database;
}

function makeJob(
  leaseToken: string,
  generationToken = `source-${leaseToken}`
): TaskMemorySearchJob {
  return {
    attempts: 1,
    entityId: "message-1",
    entityType: "message",
    generationToken,
    key: "message:message-1",
    leaseToken,
    nextChunk: 0,
    taskId: "task-1"
  };
}

function makeDocument(
  generation: string,
  body: string
): TaskMemoryIndexDocument {
  return {
    body,
    embeddingText: body,
    messageId: "message-1",
    messageOrdinal: 0,
    messageRole: "user",
    sessionId: "session-1",
    sourceType: "message",
    taskId: "task-1",
    title: "",
    vectorId: `m:c2hhcmVk:0:${generation}`
  };
}
