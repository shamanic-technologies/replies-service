import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

// Mock runs-service so middleware run lifecycle is observable.
const createRunMock = vi.fn();
const updateRunStatusMock = vi.fn();
vi.mock("../../src/lib/runs-service.js", () => ({
  createRun: (...args: unknown[]) => createRunMock(...args),
  updateRunStatus: (...args: unknown[]) => updateRunStatusMock(...args),
}));

// Imported AFTER mock declaration so middleware picks up the stub.
const { createTestApp, getAuthHeaders } = await import("../helpers/test-app.js");
const { cleanTestData, closeDb } = await import("../helpers/test-db.js");
const { db } = await import("../../src/db/index.js");
const { journalistReplies } = await import("../../src/db/schema.js");

const app = createTestApp();

const RUN_ID_FROM_MIDDLEWARE = "11111111-1111-1111-1111-111111111111";
const PARENT_RUN_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  await cleanTestData();
  createRunMock.mockReset();
  updateRunStatusMock.mockReset();
  createRunMock.mockResolvedValue({
    id: RUN_ID_FROM_MIDDLEWARE,
    organizationId: "test-org-id",
    userId: null,
    brandId: null,
    campaignId: null,
    serviceName: "replies-service",
    taskName: "replies-service",
    status: "running",
    parentRunId: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  updateRunStatusMock.mockResolvedValue({});
});

afterAll(async () => {
  await cleanTestData();
  await closeDb();
});

const MINIMAL_BODY = {
  journalistId: "journalist-1",
  campaignId: "campaign-1",
  brandId: "brand-1",
  status: "positive_for_earned" as const,
  source: "manual" as const,
};

describe("auth", () => {
  it("rejects POST without x-api-key", async () => {
    const res = await request(app)
      .post("/orgs/journalist-replies")
      .send(MINIMAL_BODY);
    expect(res.status).toBe(401);
  });

  it("rejects POST with bad x-api-key", async () => {
    const res = await request(app)
      .post("/orgs/journalist-replies")
      .set({ ...getAuthHeaders({ "X-API-Key": "wrong" }) })
      .send(MINIMAL_BODY);
    expect(res.status).toBe(401);
  });

  it("rejects POST without x-org-id", async () => {
    const headers = getAuthHeaders();
    delete (headers as Record<string, string>)["x-org-id"];
    const res = await request(app)
      .post("/orgs/journalist-replies")
      .set(headers)
      .send(MINIMAL_BODY);
    expect(res.status).toBe(400);
  });
});

describe("POST /orgs/journalist-replies", () => {
  it("creates a manual row, persists identity headers + run IDs", async () => {
    const res = await request(app)
      .post("/orgs/journalist-replies")
      .set(getAuthHeaders())
      .send(MINIMAL_BODY);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.orgId).toBe("test-org-id");
    expect(res.body.userId).toBe("test-user-id");
    expect(res.body.setByUserId).toBe("test-user-id");
    expect(res.body.parentRunId).toBe(PARENT_RUN_ID);
    expect(res.body.runId).toBe(RUN_ID_FROM_MIDDLEWARE);
    expect(res.body.source).toBe("manual");
    expect(res.body.status).toBe("positive_for_earned");
  });

  it("creates a row when x-user-id is absent (header optional)", async () => {
    const headers = getAuthHeaders();
    delete (headers as Record<string, string>)["x-user-id"];
    const res = await request(app)
      .post("/orgs/journalist-replies")
      .set(headers)
      .send(MINIMAL_BODY);

    expect(res.status).toBe(201);
    expect(res.body.userId).toBeNull();
    expect(res.body.setByUserId).toBeNull();
  });

  it("rejects an invalid status enum", async () => {
    const res = await request(app)
      .post("/orgs/journalist-replies")
      .set(getAuthHeaders())
      .send({ ...MINIMAL_BODY, status: "not_a_real_status" });
    expect(res.status).toBe(400);
  });

  it("rejects missing journalistId", async () => {
    const { journalistId, ...rest } = MINIMAL_BODY;
    const res = await request(app)
      .post("/orgs/journalist-replies")
      .set(getAuthHeaders())
      .send(rest);
    expect(res.status).toBe(400);
  });

  it("calls runs-service createRun and updateRunStatus(completed) on 2xx", async () => {
    const res = await request(app)
      .post("/orgs/journalist-replies")
      .set(getAuthHeaders())
      .send(MINIMAL_BODY);
    expect(res.status).toBe(201);
    // Allow res.on('finish') hook to fire.
    await new Promise((r) => setImmediate(r));
    expect(createRunMock).toHaveBeenCalledTimes(1);
    expect(updateRunStatusMock).toHaveBeenCalledWith(
      RUN_ID_FROM_MIDDLEWARE,
      "completed"
    );
  });
});

describe("GET /orgs/journalist-replies/current", () => {
  it("returns 404 when no row exists", async () => {
    const res = await request(app)
      .get("/orgs/journalist-replies/current")
      .query({ journalistId: "journalist-1", campaignId: "campaign-1" })
      .set(getAuthHeaders());
    expect(res.status).toBe(404);
  });

  it("returns the latest row by created_at DESC", async () => {
    await request(app)
      .post("/orgs/journalist-replies")
      .set(getAuthHeaders())
      .send({ ...MINIMAL_BODY, status: "more_info_asked" });

    // Force visible time gap (separate ms) so DESC ordering is deterministic.
    await new Promise((r) => setTimeout(r, 5));

    const second = await request(app)
      .post("/orgs/journalist-replies")
      .set(getAuthHeaders())
      .send({ ...MINIMAL_BODY, status: "earned_publication_confirmed" });

    const res = await request(app)
      .get("/orgs/journalist-replies/current")
      .query({ journalistId: "journalist-1", campaignId: "campaign-1" })
      .set(getAuthHeaders());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(second.body.id);
    expect(res.body.status).toBe("earned_publication_confirmed");
  });

  it("tenant isolation: foreign org returns 404", async () => {
    await request(app)
      .post("/orgs/journalist-replies")
      .set(getAuthHeaders())
      .send(MINIMAL_BODY);

    const res = await request(app)
      .get("/orgs/journalist-replies/current")
      .query({ journalistId: "journalist-1", campaignId: "campaign-1" })
      .set(getAuthHeaders({ "x-org-id": "other-org" }));

    expect(res.status).toBe(404);
  });
});

describe("GET /orgs/journalist-replies (history)", () => {
  it("returns rows DESC by created_at", async () => {
    await request(app)
      .post("/orgs/journalist-replies")
      .set(getAuthHeaders())
      .send({ ...MINIMAL_BODY, status: "more_info_asked" });
    await new Promise((r) => setTimeout(r, 5));
    await request(app)
      .post("/orgs/journalist-replies")
      .set(getAuthHeaders())
      .send({ ...MINIMAL_BODY, status: "earned_publication_confirmed" });

    const res = await request(app)
      .get("/orgs/journalist-replies")
      .query({ journalistId: "journalist-1", campaignId: "campaign-1" })
      .set(getAuthHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].status).toBe("earned_publication_confirmed");
    expect(res.body[1].status).toBe("more_info_asked");
  });

  it("tenant isolation: foreign org returns empty array", async () => {
    await request(app)
      .post("/orgs/journalist-replies")
      .set(getAuthHeaders())
      .send(MINIMAL_BODY);

    const res = await request(app)
      .get("/orgs/journalist-replies")
      .query({ journalistId: "journalist-1", campaignId: "campaign-1" })
      .set(getAuthHeaders({ "x-org-id": "other-org" }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("PATCH /orgs/journalist-replies/:id", () => {
  async function createManualRow(overrides: Record<string, unknown> = {}) {
    const res = await request(app)
      .post("/orgs/journalist-replies")
      .set(getAuthHeaders())
      .send({ ...MINIMAL_BODY, ...overrides });
    return res.body as { id: string };
  }

  it("updates status, note, publicationUrl on a manual row", async () => {
    const row = await createManualRow();
    const res = await request(app)
      .patch(`/orgs/journalist-replies/${row.id}`)
      .set(getAuthHeaders())
      .send({
        status: "earned_publication_confirmed",
        note: "verified by editor",
        publicationUrl: "https://example.com/article",
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("earned_publication_confirmed");
    expect(res.body.note).toBe("verified by editor");
    expect(res.body.publicationUrl).toBe("https://example.com/article");
  });

  it("returns 409 when patching an auto-source row", async () => {
    // Insert directly to bypass the manual-only POST default.
    const [autoRow] = await db
      .insert(journalistReplies)
      .values({
        journalistId: "journalist-1",
        campaignId: "campaign-1",
        brandId: "brand-1",
        orgId: "test-org-id",
        status: "more_info_asked",
        source: "auto",
      })
      .returning();

    const res = await request(app)
      .patch(`/orgs/journalist-replies/${autoRow.id}`)
      .set(getAuthHeaders())
      .send({ note: "should fail" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Cannot patch auto-source row");
  });

  it("returns 404 for foreign org (tenant isolation)", async () => {
    const row = await createManualRow();
    const res = await request(app)
      .patch(`/orgs/journalist-replies/${row.id}`)
      .set(getAuthHeaders({ "x-org-id": "other-org" }))
      .send({ note: "intruder" });
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent id", async () => {
    const res = await request(app)
      .patch(`/orgs/journalist-replies/00000000-0000-0000-0000-000000000099`)
      .set(getAuthHeaders())
      .send({ note: "ghost" });
    expect(res.status).toBe(404);
  });
});

describe("run lifecycle on failure", () => {
  it("calls updateRunStatus(failed) on 4xx response", async () => {
    const res = await request(app)
      .get("/orgs/journalist-replies/current")
      .query({ journalistId: "missing", campaignId: "missing" })
      .set(getAuthHeaders());
    expect(res.status).toBe(404);
    await new Promise((r) => setImmediate(r));
    expect(updateRunStatusMock).toHaveBeenCalledWith(
      RUN_ID_FROM_MIDDLEWARE,
      "failed"
    );
  });
});
