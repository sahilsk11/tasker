# tasker

TypeScript frontend/backend for creating and viewing coding-agent tasks with persistent artifacts.

## Stack

- Node 24 LTS for backend and worker runtime.
- pnpm workspaces for the monorepo.
- Vite + React for the frontend.
- Fastify for the local API and Hono for the hosted API.
- Strict TypeScript and ESLint across all packages.

## Commands

```sh
corepack enable
pnpm install
pnpm check:ci
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm install-cli
pnpm install-daemon
pnpm dev:web
pnpm dev:api
pnpm dev:worker
```

## CLI install

Install the `tasker` CLI on the current machine:

```sh
./setup/install-cli.sh
```

The installer builds the CLI, copies a runtime snapshot into a user-owned
Tasker CLI directory, installs native runtime dependencies, writes a `tasker`
shim into a user bin directory, and verifies `tasker runtime` without an API
server.

Default install locations:

```text
macOS: ~/Library/Application Support/Tasker CLI
Linux: ~/.local/share/tasker-cli
```

Use a custom install root or bin directory when needed:

```sh
./setup/install-cli.sh --install-root /tmp/tasker-cli --bin-dir "$HOME/.local/bin"
```

## Daemon install

`pnpm install-daemon` builds Tasker, copies a runtime snapshot into a per-user
Tasker directory, installs a user service, verifies `/health`, and opens the app.

Default install:

```sh
./setup/install-daemon.sh --yes
```

Default URL:

```text
http://tasker.localhost:48273
```

Pretty URL mode keeps the app daemon as the current user and installs a small
root-owned port-80 proxy:

```sh
pnpm install-daemon --access pretty
```

Pretty URL mode may prompt for a password.

Install locations:

```text
macOS: ~/Library/Application Support/Tasker
Linux: ~/.local/share/tasker
```

## Hosted Tasker

[tasker.ultron.sh](https://tasker.ultron.sh) serves the existing web app and a
subset of the API from a Cloudflare Worker. D1 stores tasks, subtasks, and
session references. The hosted app runs behind Cloudflare Access. Settings
edits the hosted action catalog. Launching agents and managing local files
requires the local app. Working directories and transcript paths, when
supplied, refer to paths on the originating machine.

Cloudflare Terraform provisions the Worker and D1 database. A push to
`main` (including a PR merge) runs CI, builds the hosted app, applies D1
migrations, and deploys the Worker after checks pass. Use the CI workflow
dispatch on `main` for a manual retry.

Set the repository Actions secret `CF_GH_DEPLOY_TASKER` to an
account-owned Cloudflare API token. Grant Workers Editor for the `tasker`
Worker, D1 write access for the `tasker` database, and Workers Routes
Write and Zone Read for `ultron.sh` so Wrangler can reconcile the custom
domain. Scope permissions to the Tasker resources and zone wherever
Cloudflare offers resource scoping. The deploy job uses the
`tasker_d1_id` output from the Cloudflare Terraform repo.

The D1 baseline reflects the Node schema through migration 000016.
Existing Node databases can be copied into D1 separately.

### Register a session from an agent

Send both `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers using
the Ultron Access service token. Tasker uses Cloudflare Access for API auth.

1. Create a task with `POST /api/tasks` and a JSON body containing `title`
   and an optional `description`.
2. Send `POST /api/tasks/<task-id>/sessions` with a `provider`, an optional
   `providerId`, and optional `metadata`. Send the source app's actual ID as
   `providerId`, a readable `displayTitle`, and any known provenance. For example:

   ```json
   {
     "provider": "t3",
     "providerId": "your-thread-id",
     "displayTitle": "Review API design",
     "machineName": "Strucker",
     "clientName": "T3",
     "sourceUrl": "t3-thread://v2/your-environment-id/your-thread-id",
     "metadata": { "summary": "What we decided" }
   }
   ```

Leave unknown provenance unset. Use `appName` for a source such as Cloud
Voice or Grokbot. The link can be an HTTPS conversation URL or a desktop
deep link copied from the source app. Read back the saved session with
`GET /api/tasks/<task-id>/sessions`. To update its title or provenance,
send those fields to `PATCH /api/tasks/<task-id>/sessions/<session-id>`.

### Session lookup & messages HTTP API

Routes below are mounted at `/api/...` on hosted Tasker (and at `/...` on the
local Fastify API when `routePrefix` is unset).

#### `GET /api/sessions?provider=<provider>&providerId=<providerId>`

Resolve registered (claimed) sessions across all tasks by provider and provider ID.

- Query params: `provider` and `providerId` (both required, non-empty; `400` if missing or blank).
- Response (`200`): `{ "sessions": [ ... ] }` using the same session object shape as `GET /api/tasks/<task-id>/sessions` (including `id`, `taskId`, `provider`, `providerId`, provenance fields, `metadata`, `createdAt`, `claimedAt`). Returns `{ "sessions": [] }` when none match.

#### `GET /api/sessions/<session-id>/messages/head`

Return the current message head for incremental resume.

- Response (`200`): `{ "count": 0, "lastOrdinal": null, "lastExternalId": null }` (or `{ "count": 42, "lastOrdinal": 41, "lastExternalId": "msg-42" }`).
- Errors: `404` if `<session-id>` does not exist.

#### `POST /api/sessions/<session-id>/messages`

Idempotently append clean conversation messages to a session.

- Request body:
  ```json
  {
    "messages": [
      {
        "externalId": "msg-1",
        "ordinal": 0,
        "role": "user",
        "text": "Hello",
        "occurredAt": "2026-01-01T10:00:00Z"
      }
    ]
  }
  ```
  - `externalId`: non-empty string, unique per session.
  - `ordinal`: non-negative integer.
  - `role`: `"user"` or `"assistant"`.
  - `text`: non-empty string, max `256000` chars.
  - `occurredAt`: optional/nullable ISO-8601 datetime with timezone offset.
  - Batch limits: `1..200` messages per request (Fastify route body limit is 16 MiB).
- Response (`200`): `{ "inserted": 3, "skipped": 0, "total": 3 }`.
- Idempotency & errors:
  - Same `externalId` with identical `text` (same SHA-256 content hash) is skipped.
  - Same `externalId` with different `text` (against stored rows or within the same batch) returns `409` with `{ "error": "...", "conflictingExternalIds": ["..."] }` and inserts nothing.
  - Unknown `<session-id>` returns `404`; invalid payload returns `400`.
- Incremental resume: call `GET /api/sessions/<session-id>/messages/head`; if `lastOrdinal` is `null`, send all messages, otherwise send only messages with `ordinal > lastOrdinal` in batches of up to 200.

#### `GET /api/sessions/<session-id>/messages?after=<ordinal>&limit=<1..500>`

List stored messages ordered by `ordinal ASC, created_at ASC`.

- Query params: optional `after` (non-negative integer, exclusive) and `limit` (`1..500`, default `200`).
- Response (`200`): `{ "messages": [ { "id", "sessionId", "externalId", "ordinal", "role", "text", "contentHash", "occurredAt", "createdAt" } ], "nextAfter": 199 | null }`.
- Errors: `404` for unknown session, `400` for invalid query params.

## Layout

```text
apps/web        Vite React frontend
apps/api        Node API for tasks, events, artifacts
apps/worker     Local agent session runner
packages/core   Shared task/run/artifact types and schemas
packages/agents Local agent process abstractions
```
