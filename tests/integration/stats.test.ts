import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp, getAuthHeaders } from "../helpers/test-app.js";
import {
  cleanTestData,
  closeDb,
  insertTestRequest,
  insertTestQualification,
} from "../helpers/test-db.js";

describe("GET /stats", () => {
  const app = createTestApp();

  beforeAll(async () => {
    await cleanTestData();

    // Org A, campaign X — 2 qualifications
    const r1 = await insertTestRequest({
      orgId: "org_A",
      campaignId: "camp_X",
      brandId: "brand_1",
    });
    await insertTestQualification(r1.id, {
      classification: "interested",
      confidence: "0.90",
    });

    const r2 = await insertTestRequest({
      orgId: "org_A",
      campaignId: "camp_X",
      brandId: "brand_1",
    });
    await insertTestQualification(r2.id, {
      classification: "not_interested",
      confidence: "0.80",
    });

    // Org B, campaign Y — 1 qualification
    const r3 = await insertTestRequest({
      orgId: "org_B",
      campaignId: "camp_Y",
      brandId: "brand_2",
    });
    await insertTestQualification(r3.id, {
      classification: "interested",
      confidence: "0.75",
    });
  });

  afterAll(async () => {
    await cleanTestData();
    await closeDb();
  });

  it("should reject requests with no filter to prevent unscoped queries", async () => {
    const res = await request(app).get("/stats").set(getAuthHeaders());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one filter/i);
  });

  it("regression: should not return global data without filters (test data leak)", async () => {
    const res = await request(app).get("/stats").set(getAuthHeaders());
    expect(res.status).toBe(400);
    expect(res.body.total).toBeUndefined();
  });

  it("should filter by orgId", async () => {
    const res = await request(app)
      .get("/stats?orgId=org_A")
      .set(getAuthHeaders());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.byClassification.interested).toBe(1);
    expect(res.body.byClassification.not_interested).toBe(1);
  });

  it("should filter by campaignId", async () => {
    const res = await request(app)
      .get("/stats?campaignId=camp_Y")
      .set(getAuthHeaders());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.byClassification.interested).toBe(1);
  });

  it("regression: appId filter no longer accepted (removed)", async () => {
    // appId was removed from StatsQuerySchema — should be ignored/stripped
    const res = await request(app)
      .get("/stats?appId=app2")
      .set(getAuthHeaders());
    // appId is stripped by Zod, leaving no valid filter → 400
    expect(res.status).toBe(400);
  });

  it("should filter by brandId", async () => {
    const res = await request(app)
      .get("/stats?brandId=brand_1")
      .set(getAuthHeaders());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it("should support combined filters", async () => {
    const res = await request(app)
      .get("/stats?orgId=org_A&campaignId=camp_X")
      .set(getAuthHeaders());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it("should return empty stats when no matches", async () => {
    const res = await request(app)
      .get("/stats?orgId=nonexistent")
      .set(getAuthHeaders());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.byClassification).toEqual({});
    expect(res.body.totalCostUsd).toBe(0);
    expect(res.body.totalInputTokens).toBe(0);
    expect(res.body.totalOutputTokens).toBe(0);
  });

  it("should require auth", async () => {
    const res = await request(app).get("/stats");
    expect(res.status).toBe(401);
  });

  it("should require x-org-id and x-user-id headers", async () => {
    const res = await request(app)
      .get("/stats?orgId=org_A")
      .set({ "X-API-Key": process.env.REPLY_QUALIFICATION_SERVICE_API_KEY || "test-api-key" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/x-org-id/i);
  });

  it("should require x-run-id header", async () => {
    const res = await request(app)
      .get("/stats?orgId=org_A")
      .set({
        "X-API-Key": process.env.REPLY_QUALIFICATION_SERVICE_API_KEY || "test-api-key",
        "x-org-id": "test-org-id",
        "x-user-id": "test-user-id",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/x-run-id/i);
  });
});
