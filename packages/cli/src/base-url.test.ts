import assert from "node:assert/strict";
import test from "node:test";
import { normalizeApiBaseUrl, resolveApiBaseUrl } from "./base-url.js";

void test("resolveApiBaseUrl prefers explicit URLs over environment URLs", () => {
  assert.equal(
    resolveApiBaseUrl({
      env: { TASKER_API_BASE_URL: "http://tasker.localhost:48273" },
      explicitBaseUrl: "http://127.0.0.1:3000"
    }),
    "http://127.0.0.1:3000"
  );
});

void test("resolveApiBaseUrl uses TASKER_API_BASE_URL when no explicit URL is provided", () => {
  assert.equal(
    resolveApiBaseUrl({
      env: { TASKER_API_BASE_URL: "http://127.0.0.1:5173/" }
    }),
    "http://127.0.0.1:5173"
  );
});

void test("resolveApiBaseUrl defaults to the installed daemon API URL", () => {
  assert.equal(resolveApiBaseUrl({ env: {} }), "http://tasker.localhost:48273/api");
});

void test("normalizeApiBaseUrl adds /api to installed daemon app roots", () => {
  assert.equal(
    normalizeApiBaseUrl("http://tasker.localhost:48273"),
    "http://tasker.localhost:48273/api"
  );
});

void test("normalizeApiBaseUrl keeps installed daemon API roots unchanged", () => {
  assert.equal(
    normalizeApiBaseUrl("http://tasker.localhost:48273/api/"),
    "http://tasker.localhost:48273/api"
  );
});

void test("normalizeApiBaseUrl keeps dev API roots unchanged", () => {
  assert.equal(
    normalizeApiBaseUrl("http://127.0.0.1:3000/"),
    "http://127.0.0.1:3000"
  );
});
