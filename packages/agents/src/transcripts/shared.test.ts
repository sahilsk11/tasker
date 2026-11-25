import assert from "node:assert/strict";
import test from "node:test";
import {
  pushSessionMessagesRequestSchema,
  SESSION_MESSAGE_MAX_TEXT_LENGTH,
  SESSION_MESSAGES_MAX_PER_PUSH,
  sessionMessageSchema,
  type SessionMessage
} from "@tasker/core";
import {
  chunkMessages,
  normalizeOccurredAt,
  truncateMessageText
} from "./shared.js";

void test("truncateMessageText returns text unchanged when within limit", () => {
  const exact = "a".repeat(SESSION_MESSAGE_MAX_TEXT_LENGTH);
  assert.equal(truncateMessageText(exact), exact);
});

void test("truncateMessageText truncates oversized text with exact removed char count", () => {
  const oversized = "x".repeat(SESSION_MESSAGE_MAX_TEXT_LENGTH + 5_000);
  const truncated = truncateMessageText(oversized);

  assert.ok(truncated.length <= SESSION_MESSAGE_MAX_TEXT_LENGTH);
  const match = /…\[truncated (\d+) chars\]$/u.exec(truncated);
  assert.ok(match != null, `expected truncation marker, got tail: ${truncated.slice(-40)}`);

  const removedChars = Number(match[1]);
  const keptPrefixLength = truncated.length - match[0].length;
  assert.equal(keptPrefixLength + removedChars, oversized.length);

  const parsed = sessionMessageSchema.parse({
    externalId: "msg-1",
    occurredAt: "2026-11-23T12:00:00.000Z",
    ordinal: 0,
    role: "assistant",
    text: truncated
  });
  assert.equal(parsed.text.length, truncated.length);
});

void test("truncateMessageText avoids splitting UTF-16 surrogate pairs", () => {
  // Emoji is 2 UTF-16 code units; pick a limit where naive slicing splits a pair.
  const input = `${"a".repeat(10)}${"😀".repeat(30)}`;
  const truncated = truncateMessageText(input, 35);

  assert.ok(truncated.length <= 35);
  assert.doesNotMatch(truncated, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
});

void test("normalizeOccurredAt preserves valid ISO timestamps with offset and nulls invalid ones", () => {
  assert.equal(
    normalizeOccurredAt("2026-11-23T11:07:48.244Z"),
    "2026-11-23T11:07:48.244Z"
  );
  assert.equal(
    normalizeOccurredAt("2026-11-23T11:07:48-08:00"),
    "2026-11-23T11:07:48-08:00"
  );
  assert.equal(normalizeOccurredAt("2026-11-23T11:07:48"), null);
  assert.equal(normalizeOccurredAt("not-a-date"), null);
  assert.equal(normalizeOccurredAt(12345), null);
  assert.equal(normalizeOccurredAt(null), null);
});

void test("chunkMessages splits by default SESSION_MESSAGES_MAX_PER_PUSH and custom sizes", () => {
  const messages: SessionMessage[] = Array.from(
    { length: SESSION_MESSAGES_MAX_PER_PUSH + 5 },
    (_, index) => ({
      externalId: `m-${String(index)}`,
      occurredAt: "2026-11-23T12:00:00.000Z",
      ordinal: index,
      role: index % 2 === 0 ? "user" : "assistant",
      text: `message ${String(index)}`
    })
  );

  const defaultChunks = chunkMessages(messages);
  assert.equal(defaultChunks.length, 2);
  assert.equal(defaultChunks[0]?.length, SESSION_MESSAGES_MAX_PER_PUSH);
  assert.equal(defaultChunks[1]?.length, 5);

  for (const chunk of defaultChunks) {
    assert.doesNotThrow(() => pushSessionMessagesRequestSchema.parse({ messages: chunk }));
  }

  assert.deepEqual(chunkMessages([]), []);
  assert.equal(chunkMessages(messages.slice(0, 5), 2).length, 3);
  assert.throws(() => chunkMessages(messages, 0), RangeError);
  assert.throws(() => chunkMessages(messages, -3), RangeError);
});
