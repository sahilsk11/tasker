import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";

void test("pull request statuses are fetched from GitHub with discovered gh token", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-github-status-"));
  const ghConfigDir = join(dir, ".config", "gh");
  await mkdir(ghConfigDir, { recursive: true });
  await writeFile(
    join(ghConfigDir, "hosts.yml"),
    "github.com:\n  user: tasker\n  oauth_token: ghp_from_hosts\n"
  );

  const requests: Request[] = [];
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    github: {
      env: {},
      fetchImpl: (input, init) => {
        requests.push(new Request(input, init));
        return Promise.resolve(Response.json({
          draft: false,
          merged_at: "2026-06-15T12:00:00Z",
          number: 7,
          state: "closed",
          title: "Render resource titles"
        }));
      },
      homeDir: dir
    },
    linearApiKey: null
  });

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        urls: [
          "https://github.com/sahilsk11/tasker/pull/7",
          "https://github.com/sahilsk11/tasker/pull/7"
        ]
      },
      url: "/github/pull-requests/statuses"
    });
    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.ok(request);
    assert.equal(
      request.url,
      "https://api.github.com/repos/sahilsk11/tasker/pulls/7"
    );
    assert.equal(request.headers.get("authorization"), "Bearer ghp_from_hosts");

    const body = readJson(response.body) as {
      readonly pullRequests: ReadonlyArray<{
        readonly error: string | null;
        readonly number: number | null;
        readonly owner: string | null;
        readonly repository: string | null;
        readonly status: string;
        readonly title: string | null;
        readonly url: string;
      }>;
    };
    assert.deepEqual(body.pullRequests, [
      {
        error: null,
        number: 7,
        owner: "sahilsk11",
        repository: "tasker",
        status: "merged",
        title: "Render resource titles",
        url: "https://github.com/sahilsk11/tasker/pull/7"
      }
    ]);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("pull request statuses classify draft, open, closed, and invalid urls", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-github-statuses-"));
  const responses = [
    { draft: true, merged_at: null, number: 1, state: "open" },
    { draft: false, merged_at: null, number: 2, state: "open" },
    { draft: false, merged_at: null, number: 3, state: "closed" }
  ];
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    github: {
      env: {},
      fetchImpl: () => Promise.resolve(Response.json(responses.shift())),
      homeDir: join(dir, "missing-home")
    },
    linearApiKey: null
  });

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        urls: [
          "https://github.com/example/repo/pull/1",
          "https://github.com/example/repo/pull/2",
          "https://github.com/example/repo/pull/3",
          "https://example.com/example/repo/pull/4"
        ]
      },
      url: "/github/pull-requests/statuses"
    });
    assert.equal(response.statusCode, 200);

    const body = readJson(response.body) as {
      readonly pullRequests: ReadonlyArray<{
        readonly number: number | null;
        readonly status: string;
      }>;
    };
    assert.deepEqual(
      body.pullRequests.map((pullRequest) => ({
        number: pullRequest.number,
        status: pullRequest.status
      })),
      [
        { number: 1, status: "draft" },
        { number: 2, status: "open" },
        { number: 3, status: "closed" },
        { number: null, status: "unknown" }
      ]
    );
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("pull request statuses retry without auth when discovered token is stale", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-github-stale-token-"));
  const requests: Request[] = [];
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    github: {
      env: { GH_TOKEN: "stale-token" },
      fetchImpl: (input, init) => {
        requests.push(new Request(input, init));
        if (requests.length === 1) {
          return Promise.resolve(new Response("Bad credentials", { status: 401 }));
        }

        return Promise.resolve(Response.json({
          draft: false,
          merged_at: null,
          number: 8,
          state: "open"
        }));
      },
      homeDir: join(dir, "missing-home")
    },
    linearApiKey: null
  });

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        urls: ["https://github.com/sahilsk11/tasker/pull/8"]
      },
      url: "/github/pull-requests/statuses"
    });
    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.headers.get("authorization"), "Bearer stale-token");
    assert.equal(requests[1]?.headers.get("authorization"), null);

    const body = readJson(response.body) as {
      readonly pullRequests: ReadonlyArray<{
        readonly status: string;
      }>;
    };
    assert.equal(body.pullRequests[0]?.status, "open");
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

function readJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
