import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { KannaSessionProvider, PROVIDER_DEFAULT_MODELS, resolveModelForProvider } from "./kanna-session-provider.js";

void test("resolveModelForProvider returns provider-specific model for known providers", () => {
  assert.equal(resolveModelForProvider("codex", "fallback"), "gpt-5.5");
  assert.equal(resolveModelForProvider("claude", "fallback"), "claude-sonnet-4-5");
  assert.equal(resolveModelForProvider("cursor", "fallback"), "cursor-small");
});

void test("resolveModelForProvider falls back to fallbackModel for unknown providers", () => {
  assert.equal(resolveModelForProvider("opencode", "gpt-5.5"), "gpt-5.5");
  assert.equal(resolveModelForProvider("unknown-agent", "my-model"), "my-model");
});

void test("PROVIDER_DEFAULT_MODELS has an entry for each expected provider", () => {
  assert.ok("codex" in PROVIDER_DEFAULT_MODELS);
  assert.ok("claude" in PROVIDER_DEFAULT_MODELS);
  assert.ok("cursor" in PROVIDER_DEFAULT_MODELS);
});

void test("Kanna sessions use the latest local chat title when available", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-kanna-title-"));
  const chatsLogPath = join(dir, "chats.jsonl");

  try {
    await writeFile(
      chatsLogPath,
      [
        JSON.stringify({
          chatId: "chat-1",
          title: "New Chat",
          type: "chat_created"
        }),
        "not json",
        JSON.stringify({
          chatId: "chat-1",
          title: "Useful Kanna Title",
          type: "chat_renamed"
        }),
        JSON.stringify({
          chatId: "chat-2",
          title: "Other Chat",
          type: "chat_renamed"
        })
      ].join("\n")
    );

    const provider = new KannaSessionProvider({ chatsLogPath });
    const session = await provider.enrichSession({
      actionId: "implement",
      claimedAt: new Date("2026-06-17T00:00:00.000Z"),
      createdAt: new Date("2026-06-17T00:00:00.000Z"),
      displayTitle: null,
      id: "session-1",
      metadata: null,
      provider: "kanna",
      providerId: "chat-1",
      taskId: "task-1",
      transcriptPath: null
    });

    assert.equal(session.displayTitle, "Useful Kanna Title");
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
