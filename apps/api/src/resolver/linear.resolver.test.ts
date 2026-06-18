import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";

void test("linear state mappings can be listed and replaced per team", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-linear-mappings-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const emptyResponse = await app.inject({
      method: "GET",
      url: "/linear/state-mappings"
    });
    assert.equal(emptyResponse.statusCode, 200);
    assert.deepEqual(readJson(emptyResponse.body), { mappings: [] });

    const createResponse = await app.inject({
      method: "PUT",
      payload: {
        mappings: {
          done: "linear-done",
          ready: "linear-ready"
        }
      },
      url: "/linear/state-mappings/team-1"
    });
    assert.equal(createResponse.statusCode, 200);

    const created = readJson(createResponse.body) as {
      readonly mappings: ReadonlyArray<{
        readonly linearStateId: string;
        readonly taskState: string;
        readonly teamId: string;
      }>;
    };
    assert.deepEqual(toMappingSummary(created.mappings), [
      {
        linearStateId: "linear-done",
        taskState: "done",
        teamId: "team-1"
      },
      {
        linearStateId: "linear-ready",
        taskState: "ready",
        teamId: "team-1"
      }
    ]);

    const updateResponse = await app.inject({
      method: "PUT",
      payload: {
        mappings: {
          done: "",
          implementation: "linear-started",
          ready: null
        }
      },
      url: "/linear/state-mappings/team-1"
    });
    assert.equal(updateResponse.statusCode, 200);

    const updated = readJson(updateResponse.body) as {
      readonly mappings: ReadonlyArray<{
        readonly linearStateId: string;
        readonly taskState: string;
        readonly teamId: string;
      }>;
    };
    assert.deepEqual(toMappingSummary(updated.mappings), [
      {
        linearStateId: "linear-started",
        taskState: "implementation",
        teamId: "team-1"
      }
    ]);

    const listResponse = await app.inject({
      method: "GET",
      url: "/linear/state-mappings"
    });
    assert.equal(listResponse.statusCode, 200);
    const listed = readJson(listResponse.body) as {
      readonly mappings: ReadonlyArray<{
        readonly linearStateId: string;
        readonly taskState: string;
        readonly teamId: string;
      }>;
    };
    assert.deepEqual(toMappingSummary(listed.mappings), [
      {
        linearStateId: "linear-started",
        taskState: "implementation",
        teamId: "team-1"
      }
    ]);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("linear state mappings reject unknown Tasker states", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-linear-mapping-state-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const response = await app.inject({
      method: "PUT",
      payload: {
        mappings: {
          blocked: "linear-blocked"
        }
      },
      url: "/linear/state-mappings/team-1"
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

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

void test("patching a task state syncs mapped Linear issue states", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-linear-patch-sync-"));
  const requestBodies: unknown[] = [];
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linear: {
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        const body = (await request.clone().json()) as unknown;
        requestBodies.push(body);

        if (String((body as { readonly query?: unknown }).query).includes("issueUpdate")) {
          return Response.json({
            data: {
              issueUpdate: {
                issue: linearIssueStatusFixture({
                  stateId: "linear-done",
                  stateName: "Done"
                }),
                success: true
              }
            }
          });
        }

        return Response.json({
          data: {
            issues: {
              nodes: [
                linearIssueStatusFixture({
                  stateId: "linear-started",
                  stateName: "In Progress"
                })
              ]
            }
          }
        });
      }
    },
    linearApiKey: "lin_api_key"
  });

  try {
    const createResponse = await app.inject({
      method: "POST",
      payload: {
        description: null,
        title: "Sync this task"
      },
      url: "/tasks"
    });
    assert.equal(createResponse.statusCode, 201);
    const taskId = (readJson(createResponse.body) as {
      readonly task: { readonly id: string };
    }).task.id;

    assert.equal((await app.inject({
      method: "PUT",
      payload: {
        mappings: {
          done: "linear-done"
        }
      },
      url: "/linear/state-mappings/team-1"
    })).statusCode, 200);
    assert.equal((await app.inject({
      method: "POST",
      payload: {
        externalId: "SAS-32",
        url: "https://linear.app/example/issue/SAS-32"
      },
      url: `/tasks/${taskId}/tickets`
    })).statusCode, 201);

    const patchResponse = await app.inject({
      method: "PATCH",
      payload: {
        state: "done"
      },
      url: `/tasks/${taskId}`
    });
    assert.equal(patchResponse.statusCode, 200);
    assert.equal((readJson(patchResponse.body) as {
      readonly task: { readonly state: string };
    }).task.state, "done");
    assert.equal(requestBodies.length, 2);

    const statusBody = requestBodies[0] as {
      readonly variables: {
        readonly filter: {
          readonly and: readonly [
            { readonly team: { readonly key: { readonly eq: string } } },
            { readonly number: { readonly in: readonly number[] } }
          ];
        };
      };
    };
    assert.deepEqual(statusBody.variables.filter, {
      and: [
        { team: { key: { eq: "SAS" } } },
        { number: { in: [32] } }
      ]
    });

    const mutationBody = requestBodies[1] as {
      readonly variables: {
        readonly id: string;
        readonly input: { readonly stateId: string };
      };
    };
    assert.deepEqual(mutationBody.variables, {
      id: "issue-1",
      input: { stateId: "linear-done" }
    });
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("patching a task state without a mapping skips Linear mutation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-linear-patch-no-mapping-"));
  const requestBodies: unknown[] = [];
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linear: {
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        const body = (await request.clone().json()) as unknown;
        requestBodies.push(body);

        return Response.json({
          data: {
            issues: {
              nodes: [
                linearIssueStatusFixture({
                  stateId: "linear-started",
                  stateName: "In Progress"
                })
              ]
            }
          }
        });
      }
    },
    linearApiKey: "lin_api_key"
  });

  try {
    const createResponse = await app.inject({
      method: "POST",
      payload: {
        description: null,
        title: "Sync without mapping"
      },
      url: "/tasks"
    });
    assert.equal(createResponse.statusCode, 201);
    const taskId = (readJson(createResponse.body) as {
      readonly task: { readonly id: string };
    }).task.id;

    assert.equal((await app.inject({
      method: "POST",
      payload: {
        externalId: "SAS-32",
        url: null
      },
      url: `/tasks/${taskId}/tickets`
    })).statusCode, 201);

    const patchResponse = await app.inject({
      method: "PATCH",
      payload: {
        state: "done"
      },
      url: `/tasks/${taskId}`
    });
    assert.equal(patchResponse.statusCode, 200);
    assert.equal((readJson(patchResponse.body) as {
      readonly task: { readonly state: string };
    }).task.state, "done");
    assert.equal(requestBodies.length, 1);
    assert.ok(
      !String((requestBodies[0] as { readonly query?: unknown }).query).includes(
        "issueUpdate"
      )
    );
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("task state remains persisted when Linear state mutation fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-linear-sync-failure-"));
  const requestBodies: unknown[] = [];
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linear: {
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        const body = (await request.clone().json()) as unknown;
        requestBodies.push(body);

        if (String((body as { readonly query?: unknown }).query).includes("issueUpdate")) {
          return Response.json({
            data: {
              issueUpdate: {
                issue: linearIssueStatusFixture({
                  stateId: "linear-started",
                  stateName: "In Progress"
                }),
                success: false
              }
            }
          });
        }

        return Response.json({
          data: {
            issues: {
              nodes: [
                linearIssueStatusFixture({
                  stateId: "linear-started",
                  stateName: "In Progress"
                })
              ]
            }
          }
        });
      }
    },
    linearApiKey: "lin_api_key"
  });

  try {
    const createResponse = await app.inject({
      method: "POST",
      payload: {
        description: null,
        title: "Persist despite Linear failure"
      },
      url: "/tasks"
    });
    assert.equal(createResponse.statusCode, 201);
    const taskId = (readJson(createResponse.body) as {
      readonly task: { readonly id: string };
    }).task.id;

    assert.equal((await app.inject({
      method: "PUT",
      payload: {
        mappings: {
          done: "linear-done"
        }
      },
      url: "/linear/state-mappings/team-1"
    })).statusCode, 200);
    assert.equal((await app.inject({
      method: "POST",
      payload: {
        externalId: "SAS-32",
        url: null
      },
      url: `/tasks/${taskId}/tickets`
    })).statusCode, 201);

    const patchResponse = await app.inject({
      method: "PATCH",
      payload: {
        state: "done"
      },
      url: `/tasks/${taskId}`
    });
    assert.equal(patchResponse.statusCode, 200);
    assert.equal((readJson(patchResponse.body) as {
      readonly task: { readonly state: string };
    }).task.state, "done");
    assert.equal(requestBodies.length, 2);

    const taskResponse = await app.inject({
      method: "GET",
      url: `/tasks/${taskId}`
    });
    assert.equal((readJson(taskResponse.body) as {
      readonly task: { readonly state: string };
    }).task.state, "done");
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("artifact-driven state advancement syncs Linear only when Tasker advances", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-linear-artifact-sync-"));
  const requestBodies: unknown[] = [];
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linear: {
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        const body = (await request.clone().json()) as unknown;
        requestBodies.push(body);

        if (String((body as { readonly query?: unknown }).query).includes("issueUpdate")) {
          return Response.json({
            data: {
              issueUpdate: {
                issue: linearIssueStatusFixture({
                  stateId: "linear-planning",
                  stateName: "Planning"
                }),
                success: true
              }
            }
          });
        }

        return Response.json({
          data: {
            issues: {
              nodes: [
                linearIssueStatusFixture({
                  stateId: "linear-ready",
                  stateName: "Todo"
                })
              ]
            }
          }
        });
      }
    },
    linearApiKey: "lin_api_key"
  });

  try {
    const createResponse = await app.inject({
      method: "POST",
      payload: {
        description: null,
        title: "Advance from artifacts"
      },
      url: "/tasks"
    });
    assert.equal(createResponse.statusCode, 201);
    const taskId = (readJson(createResponse.body) as {
      readonly task: { readonly id: string };
    }).task.id;

    assert.equal((await app.inject({
      method: "PUT",
      payload: {
        mappings: {
          planning: "linear-planning",
          scoping: "linear-scoping"
        }
      },
      url: "/linear/state-mappings/team-1"
    })).statusCode, 200);
    assert.equal((await app.inject({
      method: "POST",
      payload: {
        externalId: "SAS-32",
        url: null
      },
      url: `/tasks/${taskId}/tickets`
    })).statusCode, 201);

    const planArtifactResponse = await app.inject({
      method: "POST",
      payload: {
        label: "plan",
        uri: "/tmp/tasker-plan.md"
      },
      url: `/tasks/${taskId}/artifacts`
    });
    assert.equal(planArtifactResponse.statusCode, 201);
    assert.equal(requestBodies.length, 2);

    const researchArtifactResponse = await app.inject({
      method: "POST",
      payload: {
        label: "research",
        uri: "/tmp/tasker-research.md"
      },
      url: `/tasks/${taskId}/artifacts`
    });
    assert.equal(researchArtifactResponse.statusCode, 201);
    assert.equal(requestBodies.length, 2);

    const taskResponse = await app.inject({
      method: "GET",
      url: `/tasks/${taskId}`
    });
    assert.equal((readJson(taskResponse.body) as {
      readonly task: { readonly state: string };
    }).task.state, "planning");
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

function readJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function toMappingSummary(
  mappings: ReadonlyArray<{
    readonly linearStateId: string;
    readonly taskState: string;
    readonly teamId: string;
  }>
) {
  return mappings.map((mapping) => ({
    linearStateId: mapping.linearStateId,
    taskState: mapping.taskState,
    teamId: mapping.teamId
  }));
}

function linearIssueStatusFixture(input: {
  readonly stateId: string;
  readonly stateName: string;
}) {
  return {
    id: "issue-1",
    identifier: "SAS-32",
    state: {
      id: input.stateId,
      name: input.stateName,
      position: 2,
      team: {
        id: "team-1",
        key: "SAS",
        name: "SAS"
      },
      type: "started"
    },
    url: "https://linear.app/example/issue/SAS-32"
  };
}
