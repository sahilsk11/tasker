# Render Artifacts Phased Implementation Plan

## Phase 1: Backend artifact lookup and content API

- Add repository lookup for a single task artifact by task ID and artifact ID.
- Add service methods for artifact metadata and local content reads.
- Only read artifacts that already exist in the DB.
- Support absolute local paths and `file://` URIs.
- Reject directories, unsupported URI schemes, and oversized text files.
- Return content metadata that lets the frontend choose Markdown, HTML, image, or unsupported rendering.

Status: DONE

## Phase 2: Frontend resource actions and artifact route

- Preserve group header behavior that opens the resource table.
- Carry stable IDs, task IDs, URIs, and actionable URLs through the resource row model.
- Open PR resources in a new tab.
- Navigate artifact rows to `/tasks/:taskId/artifacts/:artifactId`.
- Add API helpers for artifact metadata and content.

Status: DONE

## Phase 3: Artifact viewer page

- Add an app-contained artifact page.
- Render Markdown in view mode by default with an edit toggle and local draft preview.
- Render HTML inside a sandboxed iframe.
- Render images in a constrained, scrollable container.
- Show unsupported and error states without leaving the app.

Status: DONE

## Final Verification

- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm --filter @tasker/api test` passed.
- `pnpm --filter @tasker/web build` passed.
- Live API probe used a temporary SQLite DB on port 3300 and real local
  Markdown, HTML, and PNG files. `GET /tasks/:taskId/artifacts/:artifactId/content`
  returned `markdown utf8` with the expected Markdown body.
- Browser verification used the web app at `http://127.0.0.1:5173/` with
  the same-origin `/api` proxy aimed at the temporary API.
- Verified artifact cards navigate to the artifact route.
- Verified the Artifacts header still opens the resource table.
- Verified table row Open navigates to the HTML artifact route.
- Verified Markdown view and edit modes, sandboxed HTML iframe rendering, image
  data URL rendering, mobile Markdown layout, and PR row opening a GitHub tab.

Status: DONE
