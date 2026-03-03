import { z } from "zod";
import {
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// --- Security scheme ---

registry.registerComponent("securitySchemes", "apiKey", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
  description: "Service-to-service API key",
});

// --- Shared enums ---

export const CostSourceSchema = z
  .enum(["platform", "org"])
  .openapi("CostSource");

export const ClassificationSchema = z
  .enum([
    "willing_to_meet",
    "interested",
    "needs_more_info",
    "not_interested",
    "out_of_office",
    "unsubscribe",
    "bounce",
    "other",
  ])
  .openapi("Classification");

// --- Health schemas ---

export const HealthResponseSchema = z
  .object({
    status: z.string(),
    service: z.string(),
    timestamp: z.string(),
  })
  .openapi("HealthResponse");

export const HealthDebugResponseSchema = z
  .object({
    apiKeyConfigured: z.boolean(),
    apiKeyLength: z.number(),
    apiKeyPrefix: z.string(),
    keyServiceConfigured: z.boolean(),
    dbUrlConfigured: z.boolean(),
    dbStatus: z.string(),
  })
  .openapi("HealthDebugResponse");

// --- Qualification schemas ---

export const QualifyRequestSchema = z
  .object({
    sourceService: z.string().min(1),
    sourceOrgId: z.string().min(1),
    sourceRefId: z.string().optional(),
    brandId: z.string().optional(),
    campaignId: z.string().optional(),
    fromEmail: z.string().email(),
    toEmail: z.string().email(),
    subject: z.string().optional(),
    bodyText: z.string().optional(),
    bodyHtml: z.string().optional(),
    inReplyToMessageId: z.string().optional(),
    emailReceivedAt: z.string().optional(),
    webhookUrl: z.string().url().optional(),
  })
  .openapi("QualifyRequest");

export const QualifyResponseSchema = z
  .object({
    id: z.string().uuid(),
    requestId: z.string().uuid(),
    classification: ClassificationSchema,
    confidence: z.number().min(0).max(1),
    reasoning: z.string().nullable(),
    suggestedAction: z.string().nullable(),
    extractedDetails: z.record(z.string(), z.unknown()).nullable(),
    costUsd: z.number(),
    keySource: CostSourceSchema.optional(),
    serviceRunId: z.string().uuid().nullable().optional(),
    createdAt: z.string().or(z.date()),
  })
  .openapi("QualifyResponse");

export const QualificationItemSchema = z
  .object({
    id: z.string().uuid(),
    requestId: z.string().uuid(),
    sourceService: z.string(),
    sourceOrgId: z.string(),
    sourceRefId: z.string().nullable(),
    fromEmail: z.string(),
    subject: z.string().nullable(),
    classification: ClassificationSchema,
    confidence: z.number(),
    suggestedAction: z.string().nullable(),
    createdAt: z.string().or(z.date()),
  })
  .openapi("QualificationItem");

export const QualificationsQuerySchema = z.object({
  sourceService: z.string().optional(),
  sourceOrgId: z.string().optional(),
  sourceRefId: z.string().optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

// --- Stats schemas ---

export const StatsQuerySchema = z.object({
  orgId: z.string().optional(),
  userId: z.string().optional(),
  brandId: z.string().optional(),
  campaignId: z.string().optional(),
  runId: z.string().optional(),
});

export const StatsResponseSchema = z
  .object({
    total: z.number(),
    byClassification: z.record(z.string(), z.number()),
    totalCostUsd: z.number(),
    totalInputTokens: z.number(),
    totalOutputTokens: z.number(),
  })
  .openapi("StatsResponse");

export const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error");

export const ValidationErrorSchema = z
  .object({
    error: z.string(),
    details: z.any(),
  })
  .openapi("ValidationError");

// --- Register paths ---

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Health check",
  description: "Basic health check endpoint",
  responses: {
    200: {
      description: "Service is healthy",
      content: { "application/json": { schema: HealthResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/health/debug",
  tags: ["Health"],
  summary: "Debug health check",
  description: "Shows env var configuration status and DB connection",
  responses: {
    200: {
      description: "Debug info",
      content: { "application/json": { schema: HealthDebugResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/qualify",
  tags: ["Qualification"],
  summary: "Qualify an email reply",
  description:
    "Stores the request, runs AI classification with Claude, and returns the result synchronously.",
  security: [{ apiKey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: QualifyRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "Qualification result",
      content: { "application/json": { schema: QualifyResponseSchema } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: ValidationErrorSchema } },
    },
    401: { description: "Unauthorized - invalid or missing API key" },
    500: {
      description: "Internal server error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/qualifications/{id}",

  tags: ["Qualification"],
  summary: "Get a qualification by ID",
  description: "Fetch a specific qualification result by its UUID.",
  security: [{ apiKey: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "Qualification found",
      content: { "application/json": { schema: QualifyResponseSchema } },
    },
    401: { description: "Unauthorized - invalid or missing API key" },
    404: {
      description: "Qualification not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
    500: {
      description: "Internal server error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/qualifications",
  tags: ["Qualification"],
  summary: "List qualifications",
  description: "List qualifications with optional filters.",
  security: [{ apiKey: [] }],
  request: {
    query: QualificationsQuerySchema,
  },
  responses: {
    200: {
      description: "List of qualifications",
      content: {
        "application/json": {
          schema: z.array(QualificationItemSchema),
        },
      },
    },
    401: { description: "Unauthorized - invalid or missing API key" },
    500: {
      description: "Internal server error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/stats",
  tags: ["Stats"],
  summary: "Aggregated qualification statistics",
  description:
    "Returns qualification counts by classification. At least one filter parameter is required.",
  security: [{ apiKey: [] }],
  request: {
    query: StatsQuerySchema,
  },
  responses: {
    200: {
      description: "Aggregation result",
      content: { "application/json": { schema: StatsResponseSchema } },
    },
    400: {
      description: "At least one filter parameter is required",
      content: { "application/json": { schema: ValidationErrorSchema } },
    },
    401: { description: "Unauthorized - invalid or missing API key" },
    500: {
      description: "Internal server error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/openapi.json",
  tags: ["Meta"],
  summary: "OpenAPI specification",
  description: "Returns the OpenAPI 3.0 spec for this service.",
  responses: {
    200: { description: "OpenAPI JSON document" },
    404: {
      description: "Spec not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});
