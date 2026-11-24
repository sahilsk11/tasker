import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SESSION_MESSAGE_MAX_TEXT_LENGTH, sessionMessageSchema } from "@tasker/core";
import { locateCodexTranscript, readCodexTranscript } from "./codex.js";

function toJsonl(records: readonly unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

void test("readCodexTranscript extracts user/assistant text, drops tool & injected blocks, truncates, and keeps stable line externalIds", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-codex-test-"));
  const filePath = join(dir, "rollout-2026-11-23T10-00-00-codex-1.jsonl");

  try {
    const hugeText = `START-${"q".repeat(SESSION_MESSAGE_MAX_TEXT_LENGTH + 777)}-STOP`;
    const initialRecords = [
      // line 0: session_meta
      {
        payload: { cwd: "/tmp/repo", id: "codex-1" },
        timestamp: "2026-11-23T10:00:00.000Z",
        type: "session_meta"
      },
      // line 1: developer message (dropped)
      {
        payload: {
          content: [{ text: "System prompt", type: "input_text" }],
          role: "developer",
          type: "message"
        },
        timestamp: "2026-11-23T10:00:01.000Z",
        type: "response_item"
      },
      // line 2: injected environment block starting with `<` (dropped)
      {
        payload: {
          content: [{ text: "  <environment_context>\ncwd=/tmp\n</environment_context>", type: "input_text" }],
          role: "user",
          type: "message"
        },
        timestamp: "2026-11-23T10:00:02.000Z",
        type: "response_item"
      },
      // line 3: real user message with multiple content items including image
      {
        payload: {
          content: [
            { image_url: "data:image/png;base64,abc", type: "input_image" },
            { text: "Fix the ", type: "input_text" },
            { text: "parser\n<system-reminder>noise</system-reminder>", type: "input_text" }
          ],
          role: "user",
          type: "message"
        },
        timestamp: "2026-11-23T10:00:03.100Z",
        type: "response_item"
      },
      // line 4: function_call (dropped)
      {
        payload: {
          arguments: "{\"cmd\":\"git status\"}",
          name: "exec_command",
          type: "function_call"
        },
        timestamp: "2026-11-23T10:00:04.000Z",
        type: "response_item"
      },
      // line 5: custom_tool_call (dropped)
      {
        payload: {
          input: "*** Begin Patch",
          name: "apply_patch",
          type: "custom_tool_call"
        },
        timestamp: "2026-11-23T10:00:05.000Z",
        type: "response_item"
      },
      // line 6: non-response_item event (dropped)
      {
        payload: { message: "working" },
        timestamp: "2026-11-23T10:00:06.000Z",
        type: "event_msg"
      },
      // line 7: assistant message
      {
        payload: {
          content: [{ text: "Fixed the parser.", type: "output_text" }],
          role: "assistant",
          type: "message"
        },
        timestamp: "2026-11-23T10:00:07.250Z",
        type: "response_item"
      },
      // line 8: empty assistant message (dropped)
      {
        payload: {
          content: [{ text: "   ", type: "output_text" }],
          role: "assistant",
          type: "message"
        },
        timestamp: "2026-11-23T10:00:08.000Z",
        type: "response_item"
      },
      // line 9: oversized assistant message with missing timestamp
      {
        payload: {
          content: [{ text: hugeText, type: "output_text" }],
          role: "assistant",
          type: "message"
        },
        type: "response_item"
      }
    ];

    await writeFile(filePath, toJsonl(initialRecords), "utf8");

    const firstRead = await readCodexTranscript(filePath);
    assert.equal(firstRead.length, 3);

    for (const msg of firstRead) {
      assert.doesNotThrow(() => sessionMessageSchema.parse(msg));
    }

    assert.deepEqual(firstRead[0], {
      externalId: "3",
      occurredAt: "2026-11-23T10:00:03.100Z",
      ordinal: 0,
      role: "user",
      text: "Fix the parser"
    });
    assert.deepEqual(firstRead[1], {
      externalId: "7",
      occurredAt: "2026-11-23T10:00:07.250Z",
      ordinal: 1,
      role: "assistant",
      text: "Fixed the parser."
    });

    const hugeMessage = firstRead[2];
    assert.ok(hugeMessage != null);
    assert.equal(hugeMessage.externalId, "9");
    assert.equal(hugeMessage.ordinal, 2);
    assert.equal(hugeMessage.role, "assistant");
    assert.equal(hugeMessage.occurredAt, null);
    assert.ok(hugeMessage.text.length <= SESSION_MESSAGE_MAX_TEXT_LENGTH);
    assert.match(hugeMessage.text, /^START-q+…\[truncated \d+ chars\]$/u);

    // Append a follow-up turn and verify existing externalIds and ordinals remain unchanged.
    const appended = [
      // line 10
      {
        payload: {
          content: [{ text: "Thanks!", type: "input_text" }],
          role: "user",
          type: "message"
        },
        timestamp: "2026-11-23T10:01:00.000Z",
        type: "response_item"
      }
    ];
    await appendFile(filePath, toJsonl(appended), "utf8");

    const secondRead = await readCodexTranscript(filePath);
    assert.equal(secondRead.length, 4);
    assert.deepEqual(secondRead.slice(0, 3), firstRead);
    assert.deepEqual(secondRead[3], {
      externalId: "10",
      occurredAt: "2026-11-23T10:01:00.000Z",
      ordinal: 3,
      role: "user",
      text: "Thanks!"
    });
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("locateCodexTranscript matches first-line payload.id across nested session directories", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "tasker-codex-home-"));

  try {
    const dayDir1 = join(homeDir, ".codex", "sessions", "2026", "11", "22");
    const dayDir2 = join(homeDir, ".codex", "sessions", "2026", "11", "23");
    await mkdir(dayDir1, { recursive: true });
    await mkdir(dayDir2, { recursive: true });

    const otherPath = join(dayDir1, "rollout-other.jsonl");
    const targetPath = join(dayDir2, "rollout-target.jsonl");

    await writeFile(
      otherPath,
      `${JSON.stringify({ payload: { id: "thread-other" }, type: "session_meta" })}\n`,
      "utf8"
    );
    await writeFile(
      targetPath,
      `${JSON.stringify({ payload: { id: "thread-target" }, type: "session_meta" })}\n{"type":"event_msg"}\n`,
      "utf8"
    );

    assert.equal(
      await locateCodexTranscript("thread-target", { homeDir }),
      targetPath
    );
    assert.equal(
      await locateCodexTranscript("thread-missing", { homeDir }),
      null
    );
  } finally {
    await rm(homeDir, { force: true, recursive: true });
  }
});
