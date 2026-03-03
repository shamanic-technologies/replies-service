import { describe, it, expect } from "vitest";
import { CostSourceSchema, QualifyRequestSchema, StatsQuerySchema } from "../../src/schemas.js";

describe("CostSourceSchema", () => {
  it("should accept 'platform'", () => {
    expect(CostSourceSchema.parse("platform")).toBe("platform");
  });

  it("should accept 'org'", () => {
    expect(CostSourceSchema.parse("org")).toBe("org");
  });

  it("should reject invalid values", () => {
    expect(() => CostSourceSchema.parse("app")).toThrow();
    expect(() => CostSourceSchema.parse("byok")).toThrow();
    expect(() => CostSourceSchema.parse("invalid")).toThrow();
  });
});

describe("QualifyRequestSchema", () => {
  const validBase = {
    sourceService: "test-service",
    sourceOrgId: "org_123",
    fromEmail: "from@example.com",
    toEmail: "to@example.com",
  };

  it("should accept a minimal valid request", () => {
    const result = QualifyRequestSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("regression: should not accept parentRunId in body (moved to x-run-id header)", () => {
    const result = QualifyRequestSchema.safeParse({
      ...validBase,
      parentRunId: "550e8400-e29b-41d4-a716-446655440000",
    });
    // parentRunId is stripped by Zod (not in schema), request still valid
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).parentRunId).toBeUndefined();
    }
  });

  it("regression: should not accept appId (removed)", () => {
    const result = QualifyRequestSchema.safeParse({
      ...validBase,
      appId: "some-app",
    });
    // appId is stripped by Zod (not in schema), request still valid
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).appId).toBeUndefined();
    }
  });

  it("regression: should not accept keySource (removed)", () => {
    const result = QualifyRequestSchema.safeParse({
      ...validBase,
      keySource: "platform",
    });
    // keySource is stripped by Zod, request still valid
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).keySource).toBeUndefined();
    }
  });

  it("regression: should not accept orgId/userId in body (moved to headers)", () => {
    const result = QualifyRequestSchema.safeParse({
      ...validBase,
      orgId: "org-id",
      userId: "user-id",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).orgId).toBeUndefined();
      expect((result.data as any).userId).toBeUndefined();
    }
  });
});

describe("StatsQuerySchema", () => {
  it("regression: should not accept appId (removed)", () => {
    const result = StatsQuerySchema.safeParse({ appId: "some-app" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).appId).toBeUndefined();
    }
  });

  it("should accept orgId filter", () => {
    const result = StatsQuerySchema.safeParse({ orgId: "org-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orgId).toBe("org-1");
    }
  });
});
