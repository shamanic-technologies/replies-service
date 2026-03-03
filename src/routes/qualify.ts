import { Router } from "express";
import { db } from "../db/index.js";
import { qualificationRequests, qualifications } from "../db/schema.js";
import { serviceAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { qualifyReply } from "../lib/anthropic.js";
import { createRun, addCosts, updateRunStatus } from "../lib/runs-service.js";
import { resolveAnthropicKey } from "../lib/key-service.js";
import { eq } from "drizzle-orm";
import {
  QualifyRequestSchema,
  QualificationsQuerySchema,
} from "../schemas.js";

const router = Router();

/**
 * POST /qualify - Qualify an email reply using AI
 *
 * Identity (orgId, userId) comes from x-org-id / x-user-id headers.
 */
router.post("/qualify", serviceAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = QualifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten(),
      });
    }

    const body = parsed.data;
    const orgId = req.orgId!;
    const userId = req.userId!;
    const callerRunId = req.runId!;

    // Create a run in RunsService (caller's runId becomes parentRunId)
    let serviceRunId: string | null = null;
    try {
      const run = await createRun({
        orgId,
        userId,
        brandId: body.brandId,
        campaignId: body.campaignId,
        parentRunId: callerRunId,
      });
      serviceRunId = run.id;
    } catch (err) {
      console.error("RunsService createRun failed:", err);
    }

    // Store the request
    const [request] = await db
      .insert(qualificationRequests)
      .values({
        sourceService: body.sourceService,
        sourceOrgId: body.sourceOrgId,
        sourceRefId: body.sourceRefId,
        orgId,
        userId,
        brandId: body.brandId,
        campaignId: body.campaignId,
        runId: callerRunId,
        serviceRunId,
        fromEmail: body.fromEmail,
        toEmail: body.toEmail,
        subject: body.subject,
        bodyText: body.bodyText,
        bodyHtml: body.bodyHtml,
        inReplyToMessageId: body.inReplyToMessageId,
        emailReceivedAt: body.emailReceivedAt
          ? new Date(body.emailReceivedAt)
          : null,
      })
      .returning();

    // Resolve Anthropic API key from key-service
    let anthropicApiKey: string;
    let keySource: "platform" | "org";
    try {
      const resolved = await resolveAnthropicKey({
        orgId,
        userId,
        callerContext: {
          callerService: "reply-qualification-service",
          callerMethod: "POST",
          callerPath: "/qualify",
        },
      });
      anthropicApiKey = resolved.apiKey;
      keySource = resolved.keySource;
    } catch (err) {
      console.error("Key resolution failed:", err);
      if (serviceRunId) {
        updateRunStatus(serviceRunId, "failed").catch((e) =>
          console.error("RunsService updateRunStatus failed:", e)
        );
      }
      return res.status(502).json({ error: "Failed to resolve API key from key-service" });
    }

    // Run AI qualification
    let result;
    try {
      result = await qualifyReply({
        subject: body.subject || null,
        bodyText: body.bodyText || null,
        bodyHtml: body.bodyHtml || null,
        anthropicApiKey,
        keySource,
      });
    } catch (error) {
      // Mark run as failed in RunsService
      if (serviceRunId) {
        updateRunStatus(serviceRunId, "failed").catch((err) =>
          console.error("RunsService updateRunStatus failed:", err)
        );
      }
      throw error;
    }

    // Log costs to RunsService with costSource
    if (serviceRunId) {
      try {
        await addCosts(serviceRunId, [
          {
            costName: "anthropic-haiku-4.5-tokens-input",
            costSource: keySource,
            quantity: result.inputTokens,
          },
          {
            costName: "anthropic-haiku-4.5-tokens-output",
            costSource: keySource,
            quantity: result.outputTokens,
          },
        ]);
      } catch (err) {
        console.error("RunsService addCosts failed:", err);
      }

      // Mark run as completed
      updateRunStatus(serviceRunId, "completed").catch((err) =>
        console.error("RunsService updateRunStatus failed:", err)
      );
    }

    // Store the qualification
    const [qualification] = await db
      .insert(qualifications)
      .values({
        requestId: request.id,
        classification: result.classification as any,
        confidence: String(result.confidence),
        reasoning: result.reasoning,
        suggestedAction: result.suggestedAction,
        extractedDetails: result.extractedDetails,
        model: "claude-3-haiku-20240307",
        inputTokens: String(result.inputTokens),
        outputTokens: String(result.outputTokens),
        costUsd: String(result.costUsd),
        responseRaw: result.responseRaw,
      })
      .returning();

    res.json({
      id: qualification.id,
      requestId: request.id,
      classification: qualification.classification,
      confidence: parseFloat(String(qualification.confidence)),
      reasoning: qualification.reasoning,
      suggestedAction: qualification.suggestedAction,
      extractedDetails: qualification.extractedDetails,
      costUsd: parseFloat(String(qualification.costUsd)),
      keySource: result.keySource,
      serviceRunId,
      createdAt: qualification.createdAt,
    });
  } catch (error) {
    console.error("Qualify error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /qualifications/:id - Get a specific qualification by ID
 */
router.get(
  "/qualifications/:id",
  serviceAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      const qualification = await db.query.qualifications.findFirst({
        where: eq(qualifications.id, id),
      });

      if (!qualification) {
        return res.status(404).json({ error: "Qualification not found" });
      }

      res.json({
        id: qualification.id,
        requestId: qualification.requestId,
        classification: qualification.classification,
        confidence: parseFloat(String(qualification.confidence)),
        reasoning: qualification.reasoning,
        suggestedAction: qualification.suggestedAction,
        extractedDetails: qualification.extractedDetails,
        costUsd: parseFloat(String(qualification.costUsd || 0)),
        createdAt: qualification.createdAt,
      });
    } catch (error) {
      console.error("Get qualification error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * GET /qualifications - List qualifications with filters
 */
router.get(
  "/qualifications",
  serviceAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = QualificationsQuerySchema.safeParse(req.query);
      const { sourceOrgId, limit = "50" } = parsed.success
        ? parsed.data
        : (req.query as Record<string, string>);

      // Build query with joins
      const results = await db
        .select({
          qualification: qualifications,
          request: qualificationRequests,
        })
        .from(qualifications)
        .innerJoin(
          qualificationRequests,
          eq(qualifications.requestId, qualificationRequests.id)
        )
        .where(
          sourceOrgId
            ? eq(qualificationRequests.sourceOrgId, String(sourceOrgId))
            : undefined
        )
        .limit(parseInt(String(limit)))
        .orderBy(qualifications.createdAt);

      res.json(
        results.map((r) => ({
          id: r.qualification.id,
          requestId: r.request.id,
          sourceService: r.request.sourceService,
          sourceOrgId: r.request.sourceOrgId,
          sourceRefId: r.request.sourceRefId,
          fromEmail: r.request.fromEmail,
          subject: r.request.subject,
          classification: r.qualification.classification,
          confidence: parseFloat(String(r.qualification.confidence)),
          suggestedAction: r.qualification.suggestedAction,
          createdAt: r.qualification.createdAt,
        }))
      );
    } catch (error) {
      console.error("List qualifications error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
