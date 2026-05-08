import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";

vi.stubEnv("REPLY_QUALIFICATION_SERVICE_API_KEY", "test-api-key");
vi.stubEnv("CHAT_SERVICE_URL", "https://chat.test.local");
vi.stubEnv("CHAT_SERVICE_API_KEY", "test-chat-key");
vi.stubEnv("RUNS_SERVICE_URL", "https://runs.test.local");
vi.stubEnv("RUNS_SERVICE_API_KEY", "test-runs-key");

vi.mock("../../src/lib/chat-client.js", () => ({
  qualifyReply: vi.fn(),
}));

vi.mock("../../src/lib/runs-service.js", () => ({
  createRun: vi.fn(),
  updateRunStatus: vi.fn(),
}));

const { qualifyReply: qualifyReplyMock } = await import(
  "../../src/lib/chat-client.js"
);
const { createRun: createRunMock, updateRunStatus: updateRunStatusMock } =
  await import("../../src/lib/runs-service.js");
const qualifyRoutes = (await import("../../src/routes/qualify.js")).default;
const { db } = await import("../../src/db/index.js");
const { qualificationRequests, qualifications } = await import(
  "../../src/db/schema.js"
);
const { cleanTestData, closeDb } = await import("../helpers/test-db.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(qualifyRoutes);
  return app;
}

const authHeaders = (overrides?: Record<string, string>) => ({
  "x-api-key": "test-api-key",
  "x-org-id": "org_A",
  "x-user-id": "user_A",
  "x-run-id": "00000000-0000-0000-0000-000000000001",
  ...overrides,
});

const validBody = {
  sourceService: "mcpfactory",
  sourceOrgId: "src_org_1",
  fromEmail: "lead@company.com",
  toEmail: "sales@us.com",
  subject: "Re: Your proposal",
  bodyText: "Yes interested.",
};

const okQualifyResult = {
  classification: "interested",
  confidence: 0.85,
  reasoning: "Positive",
  suggestedAction: "forward_to_client",
  extractedDetails: {},
  inputTokens: 100,
  outputTokens: 30,
  model: "gemini-flash-lite-001",
  responseRaw: { ok: true },
};

describe("POST /qualify", () => {
  const app = buildApp();

  beforeAll(async () => {
    await cleanTestData();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (createRunMock as any).mockResolvedValue({ id: "svc_run_1" });
    (updateRunStatusMock as any).mockResolvedValue({ id: "svc_run_1" });
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("happy path: stores request + qualification, returns 200", async () => {
    (qualifyReplyMock as any).mockResolvedValue(okQualifyResult);

    const res = await request(app)
      .post("/qualify")
      .set(authHeaders())
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.classification).toBe("interested");
    expect(res.body.confidence).toBeCloseTo(0.85, 4);
    expect(res.body.serviceRunId).toBe("svc_run_1");

    expect(qualifyReplyMock).toHaveBeenCalledOnce();
    const callArg = (qualifyReplyMock as any).mock.calls[0][0];
    expect(callArg.identity.orgId).toBe("org_A");
    expect(callArg.identity.userId).toBe("user_A");
    expect(callArg.identity.runId).toBe("svc_run_1");

    expect(updateRunStatusMock).toHaveBeenCalledWith("svc_run_1", "completed");

    const stored = await db.query.qualificationRequests.findFirst({
      where: eq(qualificationRequests.orgId, "org_A"),
    });
    expect(stored).toBeDefined();
    expect(stored?.serviceRunId).toBe("svc_run_1");
  });

  it("marks run failed and returns 5xx when chat-service throws", async () => {
    (qualifyReplyMock as any).mockRejectedValue(new Error("chat-service 502"));

    const res = await request(app)
      .post("/qualify")
      .set(authHeaders({ "x-org-id": "org_fail", "x-user-id": "user_fail" }))
      .send(validBody);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(updateRunStatusMock).toHaveBeenCalledWith("svc_run_1", "failed");
  });
});

describe("GET /qualifications/:id — tenant isolation", () => {
  const app = buildApp();

  beforeAll(async () => {
    await cleanTestData();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (createRunMock as any).mockResolvedValue({ id: "svc_run_2" });
    (updateRunStatusMock as any).mockResolvedValue({ id: "svc_run_2" });
    (qualifyReplyMock as any).mockResolvedValue(okQualifyResult);
  });

  afterAll(async () => {
    await cleanTestData();
    await closeDb();
  });

  it("regression: returns 404 when qualification belongs to a different org", async () => {
    const create = await request(app)
      .post("/qualify")
      .set(authHeaders({ "x-org-id": "org_owner", "x-user-id": "u_owner" }))
      .send(validBody);
    expect(create.status).toBe(200);
    const qualId = create.body.id as string;

    const probe = await request(app)
      .get(`/qualifications/${qualId}`)
      .set(authHeaders({ "x-org-id": "org_intruder", "x-user-id": "u_intruder" }));

    expect(probe.status).toBe(404);
  });

  it("returns 200 when same org reads its own qualification", async () => {
    const create = await request(app)
      .post("/qualify")
      .set(authHeaders({ "x-org-id": "org_owner2", "x-user-id": "u_owner2" }))
      .send(validBody);
    const qualId = create.body.id as string;

    const probe = await request(app)
      .get(`/qualifications/${qualId}`)
      .set(authHeaders({ "x-org-id": "org_owner2", "x-user-id": "u_owner2" }));

    expect(probe.status).toBe(200);
    expect(probe.body.id).toBe(qualId);
  });
});
