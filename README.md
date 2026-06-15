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
pnpm dev:web
pnpm dev:api
pnpm dev:worker
```

## Layout

```text
apps/web        Vite React frontend
apps/api        Node API for tasks, events, artifacts
apps/worker     Local agent session runner
packages/core   Shared task/run/artifact types and schemas
packages/agents Local agent process abstractions
```
