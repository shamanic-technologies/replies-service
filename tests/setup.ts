import { beforeAll, afterAll, vi } from "vitest";

// Set test environment variables
process.env.REPLY_QUALIFICATION_SERVICE_DATABASE_URL = 
  process.env.REPLY_QUALIFICATION_SERVICE_DATABASE_URL || "postgresql://test:test@localhost/test";
process.env.REPLY_QUALIFICATION_SERVICE_API_KEY = "test-api-key";
process.env.CHAT_SERVICE_URL = "https://chat.test.local";
process.env.CHAT_SERVICE_API_KEY = "test-chat-key";
process.env.RUNS_SERVICE_URL = "https://runs.test.local";
process.env.RUNS_SERVICE_API_KEY = "test-runs-key";

beforeAll(() => {
  console.log("Test suite starting...");
});

afterAll(() => {
  console.log("Test suite complete.");
});
