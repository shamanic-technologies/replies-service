import { beforeAll, afterAll } from "vitest";

// Test environment variables — must be set BEFORE any module under test imports.
process.env.NODE_ENV = "test";
process.env.REPLIES_SERVICE_DATABASE_URL =
  process.env.REPLIES_SERVICE_DATABASE_URL ||
  "postgresql://test:test@localhost/test";
process.env.REPLIES_SERVICE_API_KEY = "test-api-key";
process.env.RUNS_SERVICE_URL = "https://runs.test.local";
process.env.RUNS_SERVICE_API_KEY = "test-runs-key";

beforeAll(() => {
  console.log("Test suite starting...");
});

afterAll(() => {
  console.log("Test suite complete.");
});
