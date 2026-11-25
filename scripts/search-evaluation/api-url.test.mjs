import assert from "node:assert/strict";
import test from "node:test";
import { requireLoopbackApiUrl } from "./api-url.mjs";

void test("loopback API URLs are validated consistently", () => {
  assert.equal(
    requireLoopbackApiUrl("http://127.0.0.1:4312/").href,
    "http://127.0.0.1:4312/"
  );
  assert.equal(
    requireLoopbackApiUrl("http://[::1]:4312/").hostname,
    "[::1]"
  );

  for (const url of [
    "https://127.0.0.1:4312/",
    "http://localhost:4312/",
    "http://user:password@127.0.0.1:4312/",
    "http://127.0.0.1:4312/api",
    "http://127.0.0.1:4312/?q=secret",
    "not a URL"
  ]) {
    assert.throws(
      () => requireLoopbackApiUrl(url, { invalidMessage: "rejected" }),
      /^Error: rejected$/
    );
  }
  assert.throws(
    () => requireLoopbackApiUrl(undefined, { missingMessage: "missing" }),
    /^Error: missing$/
  );
});
