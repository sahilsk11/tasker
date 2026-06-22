import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createApiClient, type FetchLike } from "./api-client.js";

void test("createApiClient returns parsed JSON for successful responses", async () => {
  const requests: Array<{ readonly init?: RequestInit; readonly url: string }> = [];
  const fetchLike: FetchLike = (input, init) => {
    requests.push({
      ...(init === undefined ? {} : { init }),
      url: String(input)
    });
    return Promise.resolve(
      createResponse({
        ok: true,
        status: 200,
        statusText: "OK",
        text: JSON.stringify({ service: "tasker-api" })
      })
    );
  };

  const client = createApiClient("http://127.0.0.1:3000", fetchLike);

  assert.deepEqual(await client.get<{ readonly service: string }>("/runtime"), {
    service: "tasker-api"
  });
  assert.deepEqual(requests, [
    {
      init: {
        headers: { "Accept": "application/json" },
        method: "GET"
      },
      url: "http://127.0.0.1:3000/runtime"
    }
  ]);
});

void test("createApiClient throws ApiError with parsed body for non-2xx responses", async () => {
  const fetchLike: FetchLike = () =>
    Promise.resolve(
      createResponse({
        ok: false,
        status: 409,
        statusText: "Conflict",
        text: JSON.stringify({ error: "Task session abc has already been claimed" })
      })
    );
  const client = createApiClient("http://127.0.0.1:3000", fetchLike);

  try {
    await client.post("/sessions/abc/claim", { provider: "codex" });
    assert.fail("Expected API request to reject");
  } catch (error) {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.message, "Task session abc has already been claimed");
    assert.deepEqual(error.body, {
      error: "Task session abc has already been claimed"
    });
  }
});

function createResponse(input: {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly text: string;
}): Pick<Response, "ok" | "status" | "statusText" | "text"> {
  return {
    ok: input.ok,
    status: input.status,
    statusText: input.statusText,
    text: () => Promise.resolve(input.text)
  };
}
