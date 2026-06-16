# tasker

TypeScript frontend/backend for creating and viewing coding-agent tasks with persistent artifacts.

## Stack

- Node 24 LTS for backend and worker runtime.
- pnpm workspaces for the monorepo.
- Vite + React for the frontend.
- Hono for the API.
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
pnpm install-daemon
pnpm dev:web
pnpm dev:api
pnpm dev:worker
```

## Daemon install

`pnpm install-daemon` builds Tasker, copies a runtime snapshot into a per-user
Tasker directory, installs a user service, verifies `/health`, and opens the app.

Default install:

```sh
pnpm install-daemon --yes
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

## SAS deploy

Pushes to `main` trigger `.github/workflows/sas-redeploy.yml`. The workflow
posts a signed GitHub-style `push` event to the SAS webhook route:

```text
https://webhooks-sahil.ultron.sh/github-tasker
```

SAS maps that route to `sahilsk11/tasker` on `main` and submits the `tasker`
deploy tag. The SAS role then pulls the latest Tasker checkout, rebuilds the
workspace, and restarts each `tasker-<user>.service` instance when code or build
artifacts changed.

The repository secret `SAS_DEPLOY_WEBHOOK_SECRET` must match the SAS-side
`WEBHOOK_GITHUB_TASKER_SECRET` value.

## Layout

```text
apps/web        Vite React frontend
apps/api        Node API for tasks, events, artifacts
apps/worker     Local agent session runner
packages/core   Shared task/run/artifact types and schemas
packages/agents Local agent process abstractions
```
