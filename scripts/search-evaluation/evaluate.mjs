import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { goldenQueries } from "./golden-queries.mjs";

const options = parseArgs(process.argv.slice(2));
const map = JSON.parse(await readFile(resolve(options.map), "utf8"));
const adapterUrl = pathToFileURL(resolve(options.adapter));
const adapter = await import(adapterUrl.href);

if (typeof adapter.search !== "function") {
  throw new Error("Search adapter must export async search(query, context)");
}
if (map.refsById == null || typeof map.refsById !== "object") {
  throw new Error("Seed map is missing refsById");
}

const refSet = new Set(Object.values(map.refsById));
const resolveId = (id) => map.refsById[id] ?? null;
const context = {
  limit: options.limit,
  ids: map.ids,
  refsById: map.refsById,
  resolveId
};
const firstPass = [];
const firstPassStartedAt = performance.now();

for (const query of goldenQueries) {
  const startedAt = performance.now();
  const results = await adapter.search(query.query, context);
  const elapsedMs = performance.now() - startedAt;
  firstPass.push({
    elapsedMs,
    query,
    refs: validateResults(results, query.id, refSet)
  });
}

const fullFirstPassMs = performance.now() - firstPassStartedAt;
const firstQueryLatencyMs = firstPass[0]?.elapsedMs ?? null;
const warmQuery = goldenQueries.find((query) => query.id === options.benchQuery);
if (warmQuery == null) {
  throw new Error(`Unknown benchmark query: ${options.benchQuery}`);
}

const warmLatencies = [];
for (let index = 0; index < options.warmRepeats; index += 1) {
  const startedAt = performance.now();
  const results = await adapter.search(warmQuery.query, context);
  validateResults(results, warmQuery.id, refSet);
  warmLatencies.push(performance.now() - startedAt);
}

const queryReports = firstPass.map(({ query, refs }) => scoreQuery(query, refs));
const positiveQueries = queryReports.filter((report) => !report.noMatch);
const totalGroups = positiveQueries.reduce(
  (sum, report) => sum + report.totalGroups,
  0
);
const matchedAt5 = positiveQueries.reduce(
  (sum, report) => sum + report.matchedGroupsAt5,
  0
);
const matchedAt10 = positiveQueries.reduce(
  (sum, report) => sum + report.matchedGroupsAt10,
  0
);
const recallAt5 = totalGroups === 0 ? 1 : matchedAt5 / totalGroups;
const recallAt10 = totalGroups === 0 ? 1 : matchedAt10 / totalGroups;
const perQueryFailures = queryReports.filter((report) => report.failures.length > 0);
const passed = recallAt5 >= 0.75 &&
  recallAt10 >= 0.9 &&
  perQueryFailures.length === 0;

console.info(JSON.stringify({
  status: passed ? "pass" : "fail",
  gates: {
    aggregateRecallAt5: { actual: recallAt5, minimum: 0.75 },
    aggregateRecallAt10: { actual: recallAt10, minimum: 0.9 },
    perQuery: perQueryFailures.length === 0
  },
  latencyMs: {
    firstQuery: firstQueryLatencyMs,
    warmQueryId: warmQuery.id,
    warmRepeats: warmLatencies.length,
    warmP50: percentile(warmLatencies, 0.5),
    warmP95: percentile(warmLatencies, 0.95),
    fullFirstPass: fullFirstPassMs
  },
  queryReports
}, null, 2));

if (!passed) {
  process.exitCode = 1;
}

function parseArgs(args) {
  const parsed = {
    adapter: null,
    benchQuery: "latency",
    limit: 10,
    map: null,
    warmRepeats: 5
  };
  const values = new Map([
    ["--adapter", "adapter"],
    ["--bench-query", "benchQuery"],
    ["--limit", "limit"],
    ["--map", "map"],
    ["--warm-repeats", "warmRepeats"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const key = values.get(option);
    const value = args[index + 1];
    if (key == null || value == null || value.startsWith("--")) {
      throw new Error(`Invalid option or missing value: ${String(option)}`);
    }

    parsed[key] = key === "limit" || key === "warmRepeats"
      ? Number(value)
      : value;
    index += 1;
  }

  if (parsed.adapter == null || parsed.map == null) {
    throw new Error("--adapter and --map are required");
  }
  if (!Number.isSafeInteger(parsed.limit) || parsed.limit < 10 || parsed.limit > 100) {
    throw new Error("--limit must be an integer from 10 through 100");
  }
  if (
    !Number.isSafeInteger(parsed.warmRepeats) ||
    parsed.warmRepeats < 0 ||
    parsed.warmRepeats > 1000
  ) {
    throw new Error("--warm-repeats must be an integer from 0 through 1000");
  }

  return parsed;
}

function validateResults(results, queryId, refs) {
  if (!Array.isArray(results) || !results.every((ref) => typeof ref === "string")) {
    throw new Error(`Adapter results for ${queryId} must be an array of normalized refs`);
  }

  const seen = new Set();
  for (const ref of results) {
    if (ref.startsWith("artifact:")) {
      throw new Error(`Artifact result is prohibited for ${queryId}: ${ref}`);
    }
    if (!refs.has(ref)) {
      throw new Error(`Unknown result ref for ${queryId}: ${ref}`);
    }
    if (seen.has(ref)) {
      throw new Error(`Duplicate result ref for ${queryId}: ${ref}`);
    }
    seen.add(ref);
  }

  return results.slice(0, options.limit);
}

function scoreQuery(query, refs) {
  const rankByRef = new Map(refs.map((ref, index) => [ref, index + 1]));
  const groupsAt5 = query.relevantGroups.filter((group) =>
    group.some((ref) => (rankByRef.get(ref) ?? Infinity) <= 5)
  ).length;
  const groupsAt10 = query.relevantGroups.filter((group) =>
    group.some((ref) => (rankByRef.get(ref) ?? Infinity) <= 10)
  ).length;
  const relevantRanks = query.relevantGroups.flatMap((group) =>
    group.map((ref) => rankByRef.get(ref)).filter((rank) => rank !== undefined)
  );
  const firstRelevantRank = relevantRanks.length === 0
    ? null
    : Math.min(...relevantRanks);
  const failures = [];

  if (query.noMatch && refs.length > 0) {
    failures.push(`no-match query returned ${String(refs.length)} fixture results`);
  }
  if (!query.noMatch && groupsAt5 < query.minGroupsAt5) {
    failures.push(
      `matched ${String(groupsAt5)} relevance groups at 5; ` +
      `requires ${String(query.minGroupsAt5)}`
    );
  }
  if (
    !query.noMatch &&
    firstRelevantRank != null &&
    firstRelevantRank > query.maxFirstRelevantRank
  ) {
    failures.push(
      `first relevant result ranked ${String(firstRelevantRank)}; ` +
      `maximum is ${String(query.maxFirstRelevantRank)}`
    );
  }
  const prohibitedTop5 = (query.prohibited ?? []).filter(
    (ref) => (rankByRef.get(ref) ?? Infinity) <= 5
  );
  if (prohibitedTop5.length > 0) {
    failures.push(`prohibited top-five results: ${prohibitedTop5.join(", ")}`);
  }

  return {
    id: query.id,
    firstRelevantRank,
    matchedGroupsAt5: groupsAt5,
    matchedGroupsAt10: groupsAt10,
    noMatch: Boolean(query.noMatch),
    totalGroups: query.relevantGroups.length,
    failures
  };
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index];
}
