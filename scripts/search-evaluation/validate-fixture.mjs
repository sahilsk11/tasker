import assert from "node:assert/strict";
import { coreTasks, makeDistractors } from "./corpus.mjs";
import { goldenQueries } from "./golden-queries.mjs";

const taskLabels = new Set(coreTasks.map((task) => task.label));
const sessionLabels = new Set();
const refs = new Set();
let messageCount = 0;
let titleOnlyCount = 0;

for (const task of coreTasks) {
  refs.add(`task:${task.label}`);
  for (const session of task.sessions) {
    assert.equal(sessionLabels.has(session.label), false, `Duplicate session label: ${session.label}`);
    sessionLabels.add(session.label);
    refs.add(`session:${session.label}`);
    if (session.messages.length === 0) {
      titleOnlyCount += 1;
    }
    for (const message of session.messages) {
      assert.ok(["user", "assistant"].includes(message.role), `Unsupported role in ${session.label}`);
      assert.ok(message.text.length > 0, `Empty message in ${session.label}`);
      messageCount += 1;
    }
  }
}

assert.ok(sessionLabels.size >= 30, `Expected at least 30 sessions, found ${sessionLabels.size}`);
assert.ok(taskLabels.size >= 10, `Expected multiple topic tasks, found ${taskLabels.size}`);
assert.ok(titleOnlyCount >= 3, `Expected title-only sessions, found ${titleOnlyCount}`);
assert.ok(messageCount >= 40, `Expected realistic user and assistant passages, found ${messageCount}`);
assert.ok(goldenQueries.length >= 15 && goldenQueries.length <= 25);

const queryIds = new Set();
for (const query of goldenQueries) {
  assert.equal(queryIds.has(query.id), false, `Duplicate query id: ${query.id}`);
  queryIds.add(query.id);
  assert.ok(query.query.trim().length > 0, `Empty query: ${query.id}`);
  for (const group of query.relevantGroups) {
    assert.ok(group.length > 0, `Empty relevance group: ${query.id}`);
    for (const ref of group) {
      assert.ok(refs.has(ref), `Unknown expected reference ${ref} in ${query.id}`);
    }
  }
  for (const ref of query.prohibited ?? []) {
    assert.ok(refs.has(ref), `Unknown prohibited reference ${ref} in ${query.id}`);
  }
  if (query.noMatch) {
    assert.equal(query.relevantGroups.length, 0, `No-match query has relevant groups: ${query.id}`);
  } else {
    assert.ok(query.minGroupsAt5 >= 1, `Missing top-five recall gate: ${query.id}`);
    assert.ok(query.minGroupsAt5 <= query.relevantGroups.length);
    assert.ok(query.maxFirstRelevantRank >= 1 && query.maxFirstRelevantRank <= 5);
  }
}

const generated = makeDistractors(17);
assert.equal(generated.reduce((sum, task) => sum + task.sessions.length, 0), 17);
assert.equal(
  new Set(generated.flatMap((task) => task.sessions.map((session) => session.label))).size,
  17
);

console.info(JSON.stringify({
  coreTasks: taskLabels.size,
  coreSessions: sessionLabels.size,
  goldenQueries: goldenQueries.length,
  messages: messageCount,
  titleOnlySessions: titleOnlyCount,
  generatedDistractorsChecked: 17
}, null, 2));
