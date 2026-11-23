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

Cloudflare Terraform provisions the Worker and D1 database. The
`deploy-tasker` workflow in `sahilsk11/cloudflare` reads the D1 binding ID,
builds Tasker from `main`, applies D1 migrations, and deploys the Worker.
The D1 baseline reflects the Node schema through migration 000016. Existing
Node databases can be copied into D1 separately.

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

## SAS deploy

The legacy Node deployment uses `.github/workflows/sas-deploy.yml` to
dispatch the `tasker` deployment in `sahilsk11/sas`. The hosted Worker is
deployed independently of SAS.

## Layout

```text
apps/web        Vite React frontend
apps/api        Node API for tasks, events, artifacts
apps/worker     Local agent session runner
packages/core   Shared task/run/artifact types and schemas
packages/agents Local agent process abstractions
```
