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

// --- Enums ---

export const JournalistReplyStatusSchema = z
  .enum([
    "positive_for_earned",
    "positive_for_paid",
    "earned_publication_confirmed",
    "paid_publication_confirmed",
    "more_info_asked",
    "not_interested",
    "unsubscribe",
    "out_of_office",
    "bounced",
    "other",
  ])
  .openapi("JournalistReplyStatus");

export const JournalistReplySourceSchema = z
  .enum(["auto", "manual"])
  .openapi("JournalistReplySource");

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
    dbUrlConfigured: z.boolean(),
    dbStatus: z.string(),
    runsServiceConfigured: z.boolean(),
  })
  .openapi("HealthDebugResponse");

// --- Journalist reply schemas ---

export const CreateJournalistReplySchema = z
  .object({
    journalistId: z.string().min(1),
    campaignId: z.string().min(1),
    brandId: z.string().min(1),
    status: JournalistReplyStatusSchema,
    source: JournalistReplySourceSchema,
    note: z.string().optional(),
    publicationUrl: z.string().url().optional(),
    fromEmail: z.string().email().optional(),
    toEmail: z.string().email().optional(),
    subject: z.string().optional(),
    bodyText: z.string().optional(),
    bodyHtml: z.string().optional(),
    inReplyToMessageId: z.string().optional(),
    emailReceivedAt: z.string().datetime().optional(),
  })
  .openapi("CreateJournalistReplyRequest");

export const PatchJournalistReplySchema = z
  .object({
    status: JournalistReplyStatusSchema.optional(),
    note: z.string().optional(),
    publicationUrl: z.string().url().optional(),
  })
  .openapi("PatchJournalistReplyRequest");

export const JournalistReplyResponseSchema = z
  .object({
    id: z.string().uuid(),
    journalistId: z.string(),
    campaignId: z.string(),
    brandId: z.string(),
    orgId: z.string(),
    userId: z.string().nullable(),
    parentRunId: z.string().nullable(),
    runId: z.string().nullable(),
    status: JournalistReplyStatusSchema,
    source: JournalistReplySourceSchema,
    setByUserId: z.string().nullable(),
    note: z.string().nullable(),
    fromEmail: z.string().nullable(),
    toEmail: z.string().nullable(),
    subject: z.string().nullable(),
    bodyText: z.string().nullable(),
    bodyHtml: z.string().nullable(),
    inReplyToMessageId: z.string().nullable(),
    emailReceivedAt: z.string().nullable(),
    publicationUrl: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("JournalistReplyResponse");

export const JournalistRepliesQuerySchema = z.object({
  journalistId: z.string().min(1),
  campaignId: z.string().min(1),
});

export const ErrorSchema = z.object({ error: z.string() }).openapi("Error");

export const ValidationErrorSchema = z
  .object({ error: z.string(), details: z.any() })
  .openapi("ValidationError");

// --- Register paths ---

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Health check",
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
  responses: {
    200: {
      description: "Debug info",
      content: { "application/json": { schema: HealthDebugResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/orgs/journalist-replies",
  tags: ["JournalistReplies"],
  summary: "Create a journalist reply row",
  description:
    "Creates a new row capturing a journalist reply. Latest row per (journalist_id, campaign_id) = current effective status. setByUserId is derived from x-user-id when source=manual.",
  security: [{ apiKey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateJournalistReplySchema } },
    },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: JournalistReplyResponseSchema } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: ValidationErrorSchema } },
    },
    401: { description: "Unauthorized" },
  },
});

registry.registerPath({
  method: "get",
  path: "/orgs/journalist-replies/current",
  tags: ["JournalistReplies"],
  summary: "Get latest reply row for a (journalist, campaign) pair",
  security: [{ apiKey: [] }],
  request: { query: JournalistRepliesQuerySchema },
  responses: {
    200: {
      description: "Latest row",
      content: { "application/json": { schema: JournalistReplyResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/orgs/journalist-replies",
  tags: ["JournalistReplies"],
  summary: "List reply history (DESC by created_at)",
  security: [{ apiKey: [] }],
  request: { query: JournalistRepliesQuerySchema },
  responses: {
    200: {
      description: "History",
      content: {
        "application/json": {
          schema: z.array(JournalistReplyResponseSchema),
        },
      },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/orgs/journalist-replies/{id}",
  tags: ["JournalistReplies"],
  summary: "Update a manual reply row",
  description: "Only allowed when source=manual. Returns 409 on auto-source rows.",
  security: [{ apiKey: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      required: true,
      content: { "application/json": { schema: PatchJournalistReplySchema } },
    },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: JournalistReplyResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
    409: {
      description: "Cannot patch auto-source row",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/openapi.json",
  tags: ["Meta"],
  summary: "OpenAPI specification",
  responses: {
    200: { description: "OpenAPI JSON document" },
    404: {
      description: "Spec not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});
