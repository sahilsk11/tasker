import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";

void test("linear issue statuses are fetched in a batch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-linear-status-"));
  const requests: Request[] = [];
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linear: {
      fetchImpl: (input, init) => {
        requests.push(new Request(input, init));
        return Promise.resolve(Response.json({
          data: {
            issues: {
              nodes: [
                {
                  id: "issue-1",
                  identifier: "SAS-32",
                  state: {
                    id: "state-1",
                    name: "In Progress",
                    position: 2,
                    team: {
                      id: "team-1",
                      key: "SAS",
                      name: "SAS"
                    },
                    type: "started"
                  },
                  url: "https://linear.app/example/issue/SAS-32"
                }
              ]
            }
          }
        }));
      }
    },
    linearApiKey: "lin_api_key"
  });

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        identifiers: ["sas-32", "SAS-32"]
      },
      url: "/linear/issues/statuses"
    });
    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.ok(request);
    assert.equal(request.headers.get("authorization"), "lin_api_key");

    const requestBody = (await request.json()) as {
      readonly variables: {
        readonly filter: {
          readonly and: readonly [
            { readonly team: { readonly key: { readonly eq: string } } },
            { readonly number: { readonly in: readonly number[] } }
          ];
        };
      };
    };
    assert.deepEqual(requestBody.variables.filter, {
      and: [
        { team: { key: { eq: "SAS" } } },
        { number: { in: [32] } }
      ]
    });

    const body = readJson(response.body) as {
      readonly issues: ReadonlyArray<{
        readonly identifier: string;
        readonly state: {
          readonly id: string;
          readonly name: string;
          readonly position: number;
          readonly team: {
            readonly id: string;
            readonly key: string;
            readonly name: string;
          };
          readonly type: string;
        };
      }>;
    };
    assert.deepEqual(body.issues.map((issue) => ({
      identifier: issue.identifier,
      state: issue.state
    })), [
      {
        identifier: "SAS-32",
        state: {
          id: "state-1",
          name: "In Progress",
          team: { id: "team-1", key: "SAS", name: "SAS" },
          position: 2,
          type: "started"
        }
      }
    ]);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("task can be created from an existing Linear ticket", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-linear-task-"));
  const requests: Request[] = [];
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linear: {
      fetchImpl: (input, init) => {
        requests.push(new Request(input, init));
        return Promise.resolve(Response.json({
          data: {
            issues: {
              nodes: [
                {
                  description: "Import the existing issue details.",
                  id: "issue-1",
                  identifier: "SAS-42",
                  state: {
                    id: "state-1",
                    name: "Todo",
                    position: 1,
                    team: {
                      id: "team-1",
                      key: "SAS",
                      name: "SAS"
                    },
                    type: "unstarted"
                  },
                  title: "Imported task",
                  url: "https://linear.app/example/issue/SAS-42"
                }
              ]
            }
          }
        }));
      }
    },
    linearApiKey: "lin_api_key"
  });

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        identifier: "https://linear.app/example/issue/SAS-42"
      },
      url: "/linear/tasks"
    });
    assert.equal(response.statusCode, 201);
    assert.equal(requests.length, 1);

    const body = readJson(response.body) as {
      readonly task: {
        readonly description: string;
        readonly id: string;
        readonly title: string;
      };
      readonly ticket: {
        readonly externalId: string;
        readonly taskId: string;
        readonly url: string;
      };
    };
    assert.equal(body.task.title, "Imported task");
    assert.equal(body.task.description, "Import the existing issue details.");
    assert.equal(body.ticket.externalId, "SAS-42");
    assert.equal(body.ticket.taskId, body.task.id);
    assert.equal(body.ticket.url, "https://linear.app/example/issue/SAS-42");

    const requestBody = (await requests[0]?.json()) as {
      readonly variables: {
        readonly filter: {
          readonly and: readonly [
            { readonly team: { readonly key: { readonly eq: string } } },
            { readonly number: { readonly in: readonly number[] } }
          ];
        };
      };
    };
    assert.deepEqual(requestBody.variables.filter, {
      and: [
        { team: { key: { eq: "SAS" } } },
        { number: { in: [42] } }
      ]
    });
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("Linear ticket can be created from an existing task", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-linear-ticket-"));
  const requests: Request[] = [];
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linear: {
      fetchImpl: (input, init) => {
        requests.push(new Request(input, init));
        return Promise.resolve(Response.json({
          data: {
            issueCreate: {
              issue: {
                id: "issue-2",
                identifier: "SAS-43",
                url: "https://linear.app/example/issue/SAS-43"
              },
              success: true
            }
          }
        }));
      }
    },
    linearApiKey: "lin_api_key"
  });

  try {
    const taskResponse = await app.inject({
      method: "POST",
      payload: {
        description: "Create a linked Linear issue.",
        title: "Linked task"
      },
      url: "/tasks"
    });
    assert.equal(taskResponse.statusCode, 201);
    const taskBody = readJson(taskResponse.body) as {
      readonly task: {
        readonly id: string;
      };
    };

    const response = await app.inject({
      method: "POST",
      payload: {
        description: "Create a linked Linear issue.",
        projectId: "project-1",
        stateId: "state-1",
        teamId: "team-1",
        title: "Linked task"
      },
      url: `/tasks/${taskBody.task.id}/linear-ticket`
    });
    assert.equal(response.statusCode, 201);
    assert.equal(requests.length, 1);

    const body = readJson(response.body) as {
      readonly issue: {
        readonly identifier: string;
        readonly url: string;
      };
      readonly ticket: {
        readonly externalId: string;
        readonly taskId: string;
        readonly url: string;
      };
    };
    assert.equal(body.issue.identifier, "SAS-43");
    assert.equal(body.issue.url, "https://linear.app/example/issue/SAS-43");
    assert.equal(body.ticket.externalId, "SAS-43");
    assert.equal(body.ticket.taskId, taskBody.task.id);
    assert.equal(body.ticket.url, "https://linear.app/example/issue/SAS-43");

    const request = requests[0];
    assert.ok(request);
    assert.equal(request.headers.get("authorization"), "lin_api_key");
    const requestBody = (await request.json()) as {
      readonly variables: {
        readonly input: {
          readonly description: string;
          readonly projectId: string;
          readonly stateId: string;
          readonly teamId: string;
          readonly title: string;
        };
      };
    };
    assert.deepEqual(requestBody.variables.input, {
      description: "Create a linked Linear issue.",
      projectId: "project-1",
      stateId: "state-1",
      teamId: "team-1",
      title: "Linked task"
    });
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

function readJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
