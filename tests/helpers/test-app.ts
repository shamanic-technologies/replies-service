import express from "express";
import healthRoutes from "../../src/routes/health.js";
import journalistRepliesRoutes from "../../src/routes/journalist-replies.js";

export function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(healthRoutes);
  app.use(journalistRepliesRoutes);
  return app;
}

export function getAuthHeaders(overrides?: Record<string, string>) {
  return {
    "X-API-Key": process.env.REPLIES_SERVICE_API_KEY || "test-api-key",
    "x-org-id": "test-org-id",
    "x-user-id": "test-user-id",
    "x-run-id": "00000000-0000-0000-0000-000000000001",
    ...overrides,
  };
}
