import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appSourcePath = join(dirname(fileURLToPath(import.meta.url)), "app.ts");

void test("createApp keeps runtime assembly behind the runtime factory boundary", async () => {
  const source = await readFile(appSourcePath, "utf8");

  assert.match(source, /from "\.\/runtime\.js"/u);
  assert.match(source, /const runtime = createTaskerRuntime\(options\);/u);
  assert.doesNotMatch(source, /from "\.\/db\//u);
  assert.doesNotMatch(source, /from "\.\/repository\//u);
  assert.doesNotMatch(
    source,
    /from "\.\/service\/(?!errors\.js")/u,
    "app.ts should not construct or import application services directly"
  );
});

void test("createApp keeps HTTP concerns and resolver wiring in app.ts", async () => {
  const source = await readFile(appSourcePath, "utf8");

  assert.match(source, /Fastify\(\{ logger: true \}\)/u);
  assert.match(source, /server\.setErrorHandler/u);
  assert.match(source, /api\.get\("\/health"/u);
  assert.match(source, /api\.get\("\/runtime", \(\) => runtime\.metadata\)/u);
  assert.match(source, /\{ prefix: options\.routePrefix \?\? "" \}/u);
  assert.match(source, /registerTaskResolver\(api, runtime\.services\.task\)/u);
  assert.match(
    source,
    /registerTaskBreakdownResolver\(api, runtime\.services\.taskBreakdown\)/u
  );
  assert.match(source, /registerWorkingPathResolver\(api, runtime\.services\.workingPath\)/u);
  assert.match(
    source,
    /registerLinearResolver\(api, runtime\.services\.linearTask, runtime\.services\.linear\)/u
  );
  assert.match(source, /registerGitHubResolver\(api, runtime\.services\.github\)/u);
  assert.match(source, /await runtime\.close\(\);/u);
});
