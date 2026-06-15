import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";

void test("external task sessions can be claimed with flexible metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-session-claim-"));
  const codexSessionsRoot = join(dir, "codex", "sessions");
  const app = await createApp({
    codexSessionsRoot,
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const taskResponse = await app.inject({
      method: "POST",
      payload: {
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
    const claimedSession = (readJson(claimResponse.body) as {
      readonly session: {
        readonly claimedAt: string | null;
        readonly metadata: Record<string, unknown> | null;
        readonly provider: string;
        readonly providerId: string | null;
        readonly transcriptPath: string | null;
      };
    }).session;
    assert.equal(typeof claimedSession.claimedAt, "string");
    assert.equal(claimedSession.provider, "codex");
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

    const claimedListResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/sessions`
    });
    assert.equal(claimedListResponse.statusCode, 200);
    assert.deepEqual(readSessionIds(claimedListResponse.body), [createdSession.id]);

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

function readJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}
