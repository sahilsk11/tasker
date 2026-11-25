import type {
  TaskMemoryEmbeddingProvider,
  TaskMemorySearchInput,
  TaskMemoryIndexDocument,
  TaskMemoryIndexSource,
  TaskMemorySearchCandidate,
  TaskMemorySearchRepository,
  TaskMemorySearchResponse,
  TaskMemorySearchResult
} from "../domain/task-memory-search.js";

export const TASK_MEMORY_INDEX_CHUNK_BATCH_SIZE = 32;
export const TASK_MEMORY_MAX_CHUNK_CHARACTERS = 480;
export const TASK_MEMORY_CHUNK_OVERLAP_CHARACTERS = 80;
const SEARCH_CANDIDATE_LIMIT = 80;
const RRF_CONSTANT = 60;
const MAX_RESULTS_PER_TASK = 4;
const MIN_SEMANTIC_SIMILARITY = 0.61;
const MIN_RELATED_TASK_TITLE_SIMILARITY = 0.52;
const RELATED_SESSION_TITLE_BOOST = 0.95;
const FTS_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "this",
  "those",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your"
]);

type TaskMemorySearchLogger = Pick<Console, "error">;

export class TaskMemorySearchService {
  public constructor(
    private readonly repository: TaskMemorySearchRepository,
    private readonly embeddings: TaskMemoryEmbeddingProvider,
    private readonly logger: TaskMemorySearchLogger = console
  ) {}

  public getIndexStatus() {
    return this.repository.getIndexStatus();
  }

  public async search(input: TaskMemorySearchInput): Promise<TaskMemorySearchResponse> {
    const expression = toFtsExpression(input.query);
    const [lexical, status] = await Promise.all([
      this.repository.lexicalSearch(expression, SEARCH_CANDIDATE_LIMIT),
      this.repository.getIndexStatus()
    ]);

    let semantic: readonly TaskMemorySearchCandidate[] = [];
    let semanticStatus: TaskMemorySearchResponse["semanticStatus"] =
      status.pendingJobs > 0 ? "indexing" : "ready";

    try {
      const [queryEmbedding] = await this.embeddings.embed([input.query]);
      if (queryEmbedding == null) {
        throw new Error("Embedding provider returned no query vector");
      }
      semantic = await this.repository.vectorSearch(
        queryEmbedding,
        SEARCH_CANDIDATE_LIMIT
      );
    } catch {
      semanticStatus = "degraded";
    }

    return {
      ...status,
      mode: semanticStatus === "degraded" ? "lexical" : "hybrid",
      results: fuseCandidates(lexical, semantic, input.limit),
      semanticStatus
    };
  }

  public async processPendingJobs(limit = 8): Promise<number> {
    const jobs = await this.repository.claimJobs(limit);
    let processed = 0;
    for (const job of jobs) {
      try {
        if (job.nextChunk === 0) {
          if (!(await this.repository.deleteSource(job))) {
            continue;
          }
        }
        const source = await this.repository.getSource(job);
        if (source != null && source.taskId !== job.taskId) {
          throw new Error("Search index source task does not match its queued task");
        }
        if (source == null || sourceHasNoIndexableText(source)) {
          if (!(await this.repository.deleteSource(job))) {
            continue;
          }
          await this.repository.completeJob(job, null);
          processed += 1;
          continue;
        }

        const documents = await makeIndexDocuments(source, job.generationToken);
        const start = job.nextChunk;
        const end = Math.min(
          documents.length,
          start + TASK_MEMORY_INDEX_CHUNK_BATCH_SIZE
        );
        const batch = documents.slice(start, end);
        if (batch.length === 0) {
          await this.repository.completeJob(job, null);
          processed += 1;
          continue;
        }
        const vectors = await this.embeddings.embed(
          batch.map((document) => document.embeddingText)
        );
        if (vectors.length !== batch.length) {
          throw new Error("Embedding provider returned the wrong vector count");
        }
        if (!(await this.repository.persistDocuments(job, batch, vectors))) {
          continue;
        }
        await this.repository.completeJob(job, end < documents.length ? end : null);
        processed += 1;
      } catch (error) {
        const delay = Math.min(30 * 60_000, 1_000 * 2 ** Math.min(job.attempts, 10));
        this.logger.error("Task memory indexing job failed; retry scheduled", {
          entityType: job.entityType,
          errorName: error instanceof Error ? error.name : "UnknownError"
        });
        await this.repository.failJob(job, new Date(Date.now() + delay).toISOString());
      }
    }
    return processed;
  }
}

export function toFtsExpression(query: string): string {
  const phrase = query.replaceAll('"', '""');
  const terms = [
    ...new Set(query.match(/[\p{L}\p{N}_-]+/gu) ?? [])
  ].filter((term) => !FTS_STOP_WORDS.has(term.toLowerCase()));
  if (terms.length === 0) {
    return '"__tasker_no_fts_tokens__"';
  }
  const conjunction = terms
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" AND ");
  return `"${phrase}" OR (${conjunction})`;
}

export function chunkText(text: string): readonly string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + TASK_MEMORY_MAX_CHUNK_CHARACTERS, text.length);
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf("\n", end),
        text.lastIndexOf(" ", end)
      );
      if (boundary > start + TASK_MEMORY_MAX_CHUNK_CHARACTERS * 0.6) {
        end = boundary;
      }
    }
    if (
      end < text.length &&
      end > start &&
      isHighSurrogate(text.charCodeAt(end - 1)) &&
      isLowSurrogate(text.charCodeAt(end))
    ) {
      end -= 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (end >= text.length) {
      break;
    }
    start = Math.max(start + 1, end - TASK_MEMORY_CHUNK_OVERLAP_CHARACTERS);
  }
  return chunks;
}

function sourceHasNoIndexableText(source: TaskMemoryIndexSource): boolean {
  return (
    source.type === "session_title" &&
    (source.sessionTitle == null || source.sessionTitle.trim().length === 0)
  );
}

async function makeIndexDocuments(
  source: TaskMemoryIndexSource,
  generationToken: string
): Promise<readonly TaskMemoryIndexDocument[]> {
  const sourceKey = source.type === "task_title"
    ? `task:${source.taskId}`
    : source.type === "session_title"
      ? `session:${source.sessionId}`
      : `message:${source.messageId}`;
  const sourceHash = await hashSourceKey(sourceKey);
  const generation = generationToken.replaceAll("-", "");

  if (source.type === "task_title") {
    return [{
      body: "",
      embeddingText: source.taskTitle,
      messageId: null,
      messageOrdinal: null,
      messageRole: null,
      sessionId: null,
      sourceType: "task_title",
      taskId: source.taskId,
      title: source.taskTitle,
      vectorId: `t:${sourceHash}:${generation}`
    }];
  }
  if (source.type === "session_title") {
    const title = source.sessionTitle?.trim() ?? "";
    return [{
      body: "",
      embeddingText: `Task: ${source.taskTitle}\nSession: ${title}`,
      messageId: null,
      messageOrdinal: null,
      messageRole: null,
      sessionId: source.sessionId,
      sourceType: "session_title",
      taskId: source.taskId,
      title,
      vectorId: `s:${sourceHash}:${generation}`
    }];
  }

  const chunks = chunkText(source.text);
  const context = [
    `Task: ${source.taskTitle}`,
    source.sessionTitle == null ? "" : `Session: ${source.sessionTitle}`
  ]
    .filter(Boolean)
    .join("\n");
  return chunks.map((body, chunkIndex) => ({
    body,
    embeddingText: `${context}\n${body}`,
    messageId: source.messageId,
    messageOrdinal: source.ordinal,
    messageRole: source.role,
    sessionId: source.sessionId,
    sourceType: "message",
    taskId: source.taskId,
    title: "",
    vectorId: `m:${sourceHash}:${String(chunkIndex)}:${generation}`
  }));
}

async function hashSourceKey(sourceKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sourceKey)
  );
  const bytes = new Uint8Array(digest).subarray(0, 16);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fuseCandidates(
  lexical: readonly TaskMemorySearchCandidate[],
  semantic: readonly TaskMemorySearchCandidate[],
  limit: number
): readonly TaskMemorySearchResult[] {
  const ranked = new Map<
    string,
    { candidate: TaskMemorySearchCandidate; score: number }
  >();

  lexical.forEach((candidate, index) => {
    const titleBoost = candidate.sourceType === "task_title" ? 1.8 : 1.25;
    const score = titleBoost / (RRF_CONSTANT + index + 1);
    ranked.set(candidate.vectorId, { candidate, score });
  });
  const supportedTaskIds = new Set(
    lexical
      .filter((candidate) => candidate.sessionId != null)
      .map((candidate) => candidate.taskId)
  );
  semantic.forEach((candidate) => {
    if (
      candidate.sessionId != null &&
      candidate.semanticSimilarity != null &&
      candidate.semanticSimilarity >= MIN_SEMANTIC_SIMILARITY
    ) {
      supportedTaskIds.add(candidate.taskId);
    }
  });
  semantic.forEach((candidate, index) => {
    const similarity = candidate.semanticSimilarity;
    const hasStrongSessionSupport = candidate.sourceType === "task_title" &&
      similarity != null &&
      similarity >= MIN_RELATED_TASK_TITLE_SIMILARITY &&
      supportedTaskIds.has(candidate.taskId);
    if (
      similarity == null ||
      (similarity < MIN_SEMANTIC_SIMILARITY && !hasStrongSessionSupport)
    ) {
      return;
    }
    const prior = ranked.get(candidate.vectorId);
    const score = 1 / (RRF_CONSTANT + index + 1);
    ranked.set(candidate.vectorId, {
      candidate,
      score: (prior?.score ?? 0) + score
    });
  });

  const bestSessionScoreByTask = new Map<string, number>();
  for (const { candidate, score } of ranked.values()) {
    if (candidate.sessionId == null) {
      continue;
    }
    bestSessionScoreByTask.set(
      candidate.taskId,
      Math.max(bestSessionScoreByTask.get(candidate.taskId) ?? 0, score)
    );
  }
  for (const entry of ranked.values()) {
    if (entry.candidate.sourceType !== "task_title") {
      continue;
    }
    const relatedSessionScore = bestSessionScoreByTask.get(entry.candidate.taskId);
    if (relatedSessionScore != null) {
      entry.score = Math.max(
        entry.score,
        relatedSessionScore * RELATED_SESSION_TITLE_BOOST
      );
    }
  }

  const grouped = new Map<
    string,
    { candidate: TaskMemorySearchCandidate; score: number }
  >();
  for (const entry of ranked.values()) {
    const key =
      entry.candidate.sessionId == null
        ? `task:${entry.candidate.taskId}`
        : `session:${entry.candidate.sessionId}`;
    const prior = grouped.get(key);
    if (prior == null || entry.score > prior.score) {
      grouped.set(key, entry);
    }
  }

  const countsByTask = new Map<string, number>();
  return [...grouped.values()]
    .sort((left, right) => right.score - left.score)
    .flatMap(({ candidate, score }) => {
      const count = countsByTask.get(candidate.taskId) ?? 0;
      if (count >= MAX_RESULTS_PER_TASK) {
        return [];
      }
      countsByTask.set(candidate.taskId, count + 1);
      return [{
        messageId: candidate.messageId,
        messageOrdinal: candidate.messageOrdinal,
        messageRole: candidate.messageRole,
        parentTaskId: candidate.parentTaskId,
        score,
        sessionId: candidate.sessionId,
        sessionSourceUrl: candidate.sessionSourceUrl,
        sessionTitle: candidate.sessionTitle,
        snippet: candidate.sourceType === "message" ? candidate.body : candidate.title,
        sourceType: candidate.sourceType,
        taskId: candidate.taskId,
        taskTitle: candidate.taskTitle
      }];
    })
    .slice(0, limit);
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
