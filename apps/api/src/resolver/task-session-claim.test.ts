import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";
import { seedTaskActionDefaults } from "../test/seed-task-action-defaults.js";

void test("external task sessions can be claimed with flexible metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-session-claim-"));
  const codexSessionsRoot = join(dir, "codex", "sessions");
  const codexSessionIndexPath = join(dir, "codex", "session_index.jsonl");
  const codexStatePath = join(dir, "codex", "state.sqlite");
  const databasePath = join(dir, "tasker.sqlite");
  const app = await createApp({
    codexSessionIndexPath,
    codexSessionsRoot,
    codexStatePath,
    databasePath,
    linearApiKey: null
  });
  await seedTaskActionDefaults(databasePath);

  try {
    const taskResponse = await app.inject({
      method: "POST",
      payload: {
        description: "Context that should reach the claiming agent.",
        title: "Claimable session"
      },
      url: "/tasks"
    });
    assert.equal(taskResponse.statusCode, 201);
    const task = (readJson(taskResponse.body) as {
      readonly task: { readonly id: string };
    }).task;

    const createSessionResponse = await app.inject({
      method: "POST",
      payload: {
        actionId: "investigate",
        claimed: false,
        provider: "codex"
      },
      url: `/tasks/${task.id}/sessions`
    });
    assert.equal(createSessionResponse.statusCode, 201);
    const createdSession = (readJson(createSessionResponse.body) as {
      readonly session: {
        readonly actionId: string | null;
        readonly claimedAt: string | null;
        readonly id: string;
        readonly provider: string;
      };
    }).session;
    assert.equal(createdSession.actionId, "investigate");
    assert.equal(createdSession.claimedAt, null);
    assert.equal(createdSession.provider, "codex");

    const resourceResponse = await app.inject({
      method: "POST",
      payload: {
        label: "other",
        uri: "/tmp/previous-notes.md"
      },
      url: `/tasks/${task.id}/artifacts`
    });
    assert.equal(resourceResponse.statusCode, 201);

    const pullRequestResponse = await app.inject({
      method: "POST",
      payload: {
        url: "https://github.com/sahilsk11/tasker/pull/123"
      },
      url: `/tasks/${task.id}/pull-requests`
    });
    assert.equal(pullRequestResponse.statusCode, 201);

    const childTaskResponse = await app.inject({
      method: "POST",
      payload: {
        parentTaskId: task.id,
        title: "Child task"
      },
      url: "/tasks"
    });
    assert.equal(childTaskResponse.statusCode, 201);

    const ticketResponse = await app.inject({
      method: "POST",
      payload: {
        externalId: "TASK-123",
        url: "https://linear.app/example/issue/TASK-123"
      },
      url: `/tasks/${task.id}/tickets`
    });
    assert.equal(ticketResponse.statusCode, 201);

    const unclaimedListResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/sessions`
    });
    assert.equal(unclaimedListResponse.statusCode, 200);
    assert.deepEqual(readSessionIds(unclaimedListResponse.body), []);

    const providerId = "019ec7cb-aeb4-7a02-b7c0-c48a5a49d342";
    const transcriptDir = join(codexSessionsRoot, "2026", "06", "14");
    const transcriptPath = join(
      transcriptDir,
      `rollout-2026-06-14T22-32-22-${providerId}.jsonl`
    );
    await mkdir(transcriptDir, { recursive: true });
    await writeFile(
      transcriptPath,
      `${JSON.stringify({
        payload: {
          cwd: "/home/sahil/projects/tasker",
          id: providerId,
          source: "exec"
        },
        type: "session_meta"
      })}\n`
    );
    await writeFile(
      codexSessionIndexPath,
      `${JSON.stringify({
        id: providerId,
        thread_name: "Investigate claimable session"
      })}\n`
    );

    const claimResponse = await app.inject({
      method: "POST",
      payload: {
        provider: "codex",
        harness: "codex_exec",
        metadata: {
          codexCliVersion: "0.139.0"
        },
        providerId,
        reportedCwd: "/home/sahil/projects/tasker"
      },
      url: `/sessions/${createdSession.id}/claim`
    });
    assert.equal(claimResponse.statusCode, 200);
    const claimBody = readJson(claimResponse.body) as {
      readonly taskOverview: {
        readonly action: {
          readonly description: string;
          readonly id: string;
          readonly label: string;
        } | null;
        readonly children: ReadonlyArray<{ readonly title: string }>;
        readonly latestTaskActivityAt: string;
        readonly resources: {
          readonly artifacts: ReadonlyArray<{
            readonly label: string;
            readonly uri: string;
          }>;
          readonly pullRequests: ReadonlyArray<{ readonly url: string }>;
          readonly sessions: ReadonlyArray<{
            readonly displayTitle: string | null;
            readonly id: string;
          }>;
          readonly tickets: ReadonlyArray<{ readonly externalId: string }>;
        };
        readonly task: {
          readonly description: string | null;
          readonly id: string;
          readonly title: string;
        };
      };
      readonly session: {
        readonly claimedAt: string | null;
        readonly displayTitle: string | null;
        readonly metadata: Record<string, unknown> | null;
        readonly provider: string;
        readonly providerId: string | null;
        readonly transcriptPath: string | null;
      };
    };
    const { taskOverview, session: claimedSession } = claimBody;
    assert.equal(typeof claimedSession.claimedAt, "string");
    assert.equal(claimedSession.provider, "codex");
    assert.equal(claimedSession.displayTitle, "Investigate claimable session");
    assert.equal(
      claimedSession.providerId,
      providerId
    );
    assert.equal(claimedSession.transcriptPath, transcriptPath);
    assert.deepEqual(claimedSession.metadata, {
      codexCliVersion: "0.139.0",
      harness: "codex_exec",
      reportedCwd: "/home/sahil/projects/tasker"
    });
    assert.equal(taskOverview.task.id, task.id);
    assert.equal(taskOverview.task.title, "Claimable session");
    assert.equal(
      taskOverview.task.description,
      "Context that should reach the claiming agent."
    );
    assert.ok(taskOverview.action);
    assert.equal(taskOverview.action.id, "investigate");
    assert.equal(taskOverview.action.label, "Investigate");
    assert.deepEqual(
      taskOverview.resources.artifacts.map((artifact) => ({
        label: artifact.label,
        uri: artifact.uri
      })),
      [
        {
          label: "other",
          uri: "/tmp/previous-notes.md"
        }
      ]
    );
    assert.deepEqual(
      taskOverview.resources.pullRequests.map((pullRequest) => pullRequest.url),
      ["https://github.com/sahilsk11/tasker/pull/123"]
    );
    assert.deepEqual(
      taskOverview.resources.sessions.map((session) => session.id),
      [createdSession.id]
    );
    assert.deepEqual(
      taskOverview.resources.sessions.map((session) => session.displayTitle),
      ["Investigate claimable session"]
    );
    assert.deepEqual(
      taskOverview.resources.tickets.map((ticket) => ticket.externalId),
      ["TASK-123"]
    );
    assert.deepEqual(
      taskOverview.children.map((child) => child.title),
      ["Child task"]
    );
    assert.equal(taskOverview.latestTaskActivityAt, claimedSession.claimedAt);

    const claimedListResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/sessions`
    });
    assert.equal(claimedListResponse.statusCode, 200);
    assert.deepEqual(readSessionIds(claimedListResponse.body), [createdSession.id]);
    assert.deepEqual(
      readSessionDisplayTitles(claimedListResponse.body),
      ["Investigate claimable session"]
    );

    const missingSessionResponse = await app.inject({
      method: "POST",
      payload: {
        providerId: "missing"
      },
      url: `/sessions/${randomUUID()}/claim`
    });
    assert.equal(missingSessionResponse.statusCode, 404);

    const alreadyClaimedResponse = await app.inject({
      method: "POST",
      payload: {
        providerId: randomUUID()
      },
      url: `/sessions/${createdSession.id}/claim`
    });
    assert.equal(alreadyClaimedResponse.statusCode, 404);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

function readSessionIds(body: string): readonly string[] {
  const parsed = readJson(body) as {
    readonly sessions: ReadonlyArray<{ readonly id: string }>;
  };
  return parsed.sessions.map((session) => session.id);
}

function readSessionDisplayTitles(body: string): ReadonlyArray<string | null> {
  const parsed = readJson(body) as {
    readonly sessions: ReadonlyArray<{ readonly displayTitle: string | null }>;
  };
  return parsed.sessions.map((session) => session.displayTitle);
}

function readJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}
