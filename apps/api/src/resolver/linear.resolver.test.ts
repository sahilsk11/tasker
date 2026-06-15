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

function readJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
