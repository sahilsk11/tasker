import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CursorSessionProvider } from "./cursor-session-provider.js";
import type { StartTaskSessionInput } from "./session-provider.js";

function buildStartInput(
  overrides: Partial<StartTaskSessionInput> = {}
): StartTaskSessionInput {
  return {
    prompt: "do the thing",
    requestedAgentProvider: "cursor",
    session: {
      actionId: "implement",
      claimedAt: null,
      createdAt: new Date("2026-06-23T00:00:00.000Z"),
      displayTitle: null,
      id: "tasker-session-1",
      metadata: null,
      provider: "cursor",
      providerId: null,
      taskId: "task-1",
      transcriptPath: null
    },
    task: {
      createdAt: new Date("2026-06-23T00:00:00.000Z"),
      description: null,
      id: "task-1",
      parentTaskId: null,
      state: "ready",
      title: "Example",
      updatedAt: new Date("2026-06-23T00:00:00.000Z"),
      waitingDependencies: [],
      workingDirectory: null
    } as StartTaskSessionInput["task"],
    workingPath: "/tmp",
    ...overrides
  };
}

async function writeFakeCursorAgent(
  dir: string,
  sessionId: string
): Promise<string> {
  const binPath = join(dir, "cursor-agent");
  // Emit a stream-json system/init line with the session id, then keep running
  // briefly to mimic an agent that stays alive after reporting its id.
  await writeFile(
    binPath,
    [
      "#!/usr/bin/env bash",
      `echo '{"type":"system","subtype":"init","session_id":"${sessionId}","model":"Composer 2.5"}'`,
      "sleep 0.2",
      ""
    ].join("\n")
  );
  await chmod(binPath, 0o755);
  return binPath;
}

void test("CursorSessionProvider launches cursor-agent and captures the session id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-cursor-"));
  try {
    const binPath = await writeFakeCursorAgent(dir, "cursor-xyz-789");
    const provider = new CursorSessionProvider({
      binPath,
      logRoot: join(dir, "logs"),
      model: "composer-2.5",
      startupTimeoutMs: 5_000
    });

    const result = await provider.startSession(buildStartInput());

    assert.equal(result.launch.provider, "cursor");
    assert.equal(result.launch.openUrl, null);
    const metadata = result.launch.metadata;
    assert.ok(metadata);
    assert.equal(metadata["cursorSessionId"], "cursor-xyz-789");
    assert.equal(metadata["agentModel"], "composer-2.5");
    assert.equal(metadata["agentProvider"], "cursor");
    assert.equal(metadata["resumeCommand"], "cursor-agent --resume cursor-xyz-789");
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("CursorSessionProvider rejects when the agent exits before reporting a session id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-cursor-fail-"));
  try {
    const binPath = join(dir, "cursor-agent");
    await writeFile(binPath, ["#!/usr/bin/env bash", "exit 1", ""].join("\n"));
    await chmod(binPath, 0o755);
    const provider = new CursorSessionProvider({
      binPath,
      logRoot: join(dir, "logs"),
      startupTimeoutMs: 5_000
    });

    await assert.rejects(
      provider.startSession(buildStartInput()),
      /Cursor agent exited before reporting a session id/
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("CursorSessionProvider enriches a session with a Cursor display title", async () => {
  const provider = new CursorSessionProvider();
  const enriched = await provider.enrichSession({
    actionId: "implement",
    claimedAt: new Date("2026-06-23T00:00:00.000Z"),
    createdAt: new Date("2026-06-23T00:00:00.000Z"),
    displayTitle: null,
    id: "session-1",
    metadata: { cursorSessionId: "abc-123" },
    provider: "cursor",
    providerId: null,
    taskId: "task-1",
    transcriptPath: null
  });

  assert.equal(enriched.displayTitle, "Cursor session abc-123");
});
