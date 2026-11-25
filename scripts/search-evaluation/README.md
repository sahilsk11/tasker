# Search evaluation fixture

This fixture is an independent, synthetic relevance set for Tasker search over
task titles, session titles, and saved user/assistant message text. It was
written before testing any search implementation. It contains no real
transcripts and creates no artifact records.

## Corpus and expected relevance

- The core set contains 13 tasks and 35 sessions across latency, conversation
  navigation, VM wake, auth, message sync, persistence, deployment, runtime
  configuration, CLI resume, accessibility, webhook, builds, and Unicode text.
- Three or more sessions intentionally have titles and no saved messages.
- Some relevant passages use generic titles or paraphrase the query. Exact
  identifiers, punctuation, Unicode, ambiguous uses of “session”, and
  irrelevant queries are included.
- `golden-queries.mjs` is the source of truth for expected-result groups,
  top-five recall, rank bounds, prohibited cross-topic results, and no-match
  expectations.
- `makeDistractors(count)` adds distinct, numbered sessions from eight
  non-golden topics. Text varies by topic and case number instead of repeating
  one boilerplate record.

References use fixture labels such as `task:task_latency` and
`session:session_first_request_delay`. Seeding writes the actual API IDs to the
map file. The evaluator derives the reverse label lookup from those IDs.

## Seed through the supported local API

From this worktree, start the repository's isolated development environment:

```sh
pnpm worktree:setup
```

It creates a temporary SQLite database, runs the API and web app, and prints
the local API URL. In another terminal, seed only that loopback API:

```sh
TASKER_API_BASE_URL=http://127.0.0.1:<api-port> \
  node scripts/search-evaluation/seed.mjs --distractors 0
```

The default ID map is `.tasker/dev-runs/search-evaluation-seed-map.json`, which
is ignored by Git. `seed.mjs` refuses non-loopback URLs and non-empty databases.
It uses the existing local routes:

1. `POST /tasks` with `{ "title": ... }`
2. `POST /tasks/:taskId/sessions` with the fixture provider and display title
3. `POST /sessions/:sessionId/messages` with ordered user/assistant messages

The public API also mounts these routes below `/api` on the hosted Worker, but
the seed script intentionally refuses hosted or remote addresses. Do not use
production credentials or a production database. If seeding fails midway,
stop that temporary setup and create a fresh one rather than retrying into a
partially seeded database.

The current `origin/main` API does not define a search route. This fixture does
not guess one. Add a small adapter only after the implementation's public
search contract is available.

## Evaluation adapter and gates

`evaluate.mjs` accepts an adapter module path. The adapter must export
`async search(query, context)` and return normalized fixture references in rank
order, for example `["session:session_first_request_delay"]`. The context
contains `limit`, `ids`, `refsById`, and `resolveId(actualApiId)`. The adapter
owns the eventual API request and response normalization; no search endpoint
or response shape is assumed here. The Tasker adapter accepts only task-title,
session-title, and message results, and rejects artifact or unsupported source
identities before resolving fixture IDs.

Example after an implementation-specific adapter exists:

```sh
node scripts/search-evaluation/evaluate.mjs \
  --adapter scripts/search-evaluation/tasker-api-adapter.mjs \
  --map .tasker/dev-runs/search-evaluation-seed-map.json \
  --warm-repeats 10
```

The Tasker API adapter calls the real local `GET /search` endpoint. It rejects
lexical-only responses and incomplete indexes so the evaluator cannot report
keyword search as semantic retrieval.

The evaluator checks:

- Each positive query's minimum number of accepted relevance groups in the top
  five and its configured first-relevant rank bound.
- Aggregate relevance-group recall of at least 0.75 at five and 0.90 at ten.
- Prohibited auth-vs-coding-session matches in the top five.
- Zero fixture hits for both no-match queries.
- No artifacts, unknown fixture references, or duplicate entity results.

It also reports first-query time and p50/p95 for repeated calls to the `latency`
query. Run it in a fresh Node process after seeding for a cold-first-search-call
vs same-process warm comparison. The API process itself has handled the seed
requests, so this does not measure API process startup. These are observations,
not an invented latency SLA or probability score.

## Corpus growth

Use a fresh `pnpm worktree:setup` database for each size so setup cost and
results are comparable. Recommended session counts are:

| Distractors | Total sessions |
| ---: | ---: |
| 0 | 35 |
| 100 | 135 |
| 500 | 535 |
| 1,000 | 1,035 |
| 5,000 | 5,035 |

For each size, seed with the corresponding `--distractors N`, then run the
same evaluator, query limit, and warm-repeat count. Record cold-first-call and
warm p50/p95 separately. Do not compare a seeded run with an API process that
has already served search queries as if both were cold.

## Fixture-only validation

This check needs only Node and does not start an app, access a database, or
call a search implementation:

```sh
node scripts/search-evaluation/validate-fixture.mjs
```
