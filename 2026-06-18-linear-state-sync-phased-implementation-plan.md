# Linear State Sync Phased Implementation Plan

Primary input: `/home/sahil/artifacts/tasker/linear-state-sync-implementation-plan.md`.

## Goal

Keep linked Linear issue state aligned after Tasker task state changes, using per-team mappings from canonical Tasker states to Linear workflow state IDs. Sync is best effort and must not block local Tasker state persistence.

## Phases

1. DONE - Add persistence and API contracts for per-team Linear state mappings.
2. DONE - Add Linear issue state mutation support and sync orchestration from Tasker state transitions.
3. DONE - Add Linear mapping settings UI.
4. DONE - Run integrated verification, commit, push, open PR, and register the PR with Tasker.

## Discoveries

- Session claim returned conflict because the session was already claimed, so no `taskOverview` came back from the claim endpoint.
- `GET /tasks/e5d1d40c-bfc0-4b74-8267-9e710df617f5` confirmed the task is `planning` as of `2026-06-18T17:59:03.190Z`.
- Mapping persistence is stored in `linear_state_mappings` keyed by `team_id` and `task_state`.
- `PUT /linear/state-mappings/:teamId` treats `null` and empty strings as mapping removal.
- `LinearStateSyncService` resolves linked tickets by both `externalId` and `url`, then applies team/task-state mappings best effort.
- Task PATCH syncs after local state persistence when `state` is present.
- Artifact-driven sync only runs when `updateStateAtLeast` actually advances the Tasker state.
- The settings dialog now has separate Actions and Linear sections; the Linear mapping form lives in its own component.

## Final Verification

- `pnpm --filter @tasker/api exec tsx --test src/resolver/linear.resolver.test.ts` passed with 8 tests covering mapping CRUD, Linear mutation payload, mapped PATCH sync, missing-mapping skip, best-effort mutation failure, and artifact-driven advancement sync.
- `pnpm --filter @tasker/api smoke:migrations` passed.
- `pnpm --filter @tasker/api typecheck` passed.
- `pnpm --filter @tasker/web typecheck` passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed.
- `pnpm worktree:setup` started a clean app with SQLite at `/tmp/tasker-dev-9ejU9I/tasker.sqlite`, API `http://127.0.0.1:38357`, and web `http://127.0.0.1:40073`.
- Browser verification with `agent-browser` opened Settings > Linear on desktop `1440x1000` and mobile `390x844`; no console/page errors appeared, and screenshots showed the no-`LINEAR_API_KEY` state without overlap or clipping.
- Direct API wire check against the clean dev server verified `GET /linear/state-mappings`, `PUT /linear/state-mappings/team-curl`, and subsequent `GET /linear/state-mappings` persisted `ready` and `planning` mappings while omitting the `done: null` mapping.
