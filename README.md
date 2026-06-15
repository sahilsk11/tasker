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

## Layout

```text
apps/web        Vite React frontend
apps/api        Node API for tasks, events, artifacts
apps/worker     Local agent session runner
packages/core   Shared task/run/artifact types and schemas
packages/agents Local agent process abstractions
```
