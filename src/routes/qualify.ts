import { Router } from "express";
import { db } from "../db/index.js";
import { qualificationRequests, qualifications } from "../db/schema.js";
import { serviceAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { qualifyReply } from "../lib/chat-client.js";
import { createRun, updateRunStatus } from "../lib/runs-service.js";
import { and, eq } from "drizzle-orm";
import {
  QualifyRequestSchema,
  QualificationsQuerySchema,
} from "../schemas.js";

const router = Router();

/**
 * POST /qualify - Qualify an email reply via chat-service.
 *
 * Identity (orgId, userId, runId) comes from x-org-id / x-user-id / x-run-id headers.
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

    // Create our own run, child of caller's run.
    const run = await createRun({
      orgId,
      userId,
      brandId: body.brandId,
      campaignId: body.campaignId,
      parentRunId: callerRunId,
    });
    const serviceRunId = run.id;

    // Persist the request row.
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

    let result;
    try {
      result = await qualifyReply({
        subject: body.subject || null,
        bodyText: body.bodyText || null,
        bodyHtml: body.bodyHtml || null,
        identity: {
          orgId,
          userId,
          runId: serviceRunId,
          brandId: body.brandId,
          campaignId: body.campaignId,
        },
      });
    } catch (error) {
      await updateRunStatus(serviceRunId, "failed").catch((err) =>
        console.error("[reply-qualification-service] updateRunStatus failed:", err),
      );
      throw error;
    }

    await updateRunStatus(serviceRunId, "completed").catch((err) =>
      console.error("[reply-qualification-service] updateRunStatus failed:", err),
    );

    const [qualification] = await db
      .insert(qualifications)
      .values({
        requestId: request.id,
        classification: result.classification as any,
        confidence: String(result.confidence),
        reasoning: result.reasoning,
        suggestedAction: result.suggestedAction,
        extractedDetails: result.extractedDetails,
        model: result.model,
        inputTokens: String(result.inputTokens),
        outputTokens: String(result.outputTokens),
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
      serviceRunId,
      createdAt: qualification.createdAt,
    });
  } catch (error) {
    console.error("[reply-qualification-service] /qualify error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /qualifications/:id - Get a qualification by ID, scoped to caller's org.
 */
router.get(
  "/qualifications/:id",
  serviceAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;

      const row = await db
        .select({ qualification: qualifications, request: qualificationRequests })
        .from(qualifications)
        .innerJoin(
          qualificationRequests,
          eq(qualifications.requestId, qualificationRequests.id),
        )
        .where(
          and(
            eq(qualifications.id, id),
            eq(qualificationRequests.orgId, orgId),
          ),
        )
        .limit(1);

      if (row.length === 0) {
        return res.status(404).json({ error: "Qualification not found" });
      }

      const q = row[0].qualification;
      res.json({
        id: q.id,
        requestId: q.requestId,
        classification: q.classification,
        confidence: parseFloat(String(q.confidence)),
        reasoning: q.reasoning,
        suggestedAction: q.suggestedAction,
        extractedDetails: q.extractedDetails,
        createdAt: q.createdAt,
      });
    } catch (error) {
      console.error("[reply-qualification-service] get qualification error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * GET /qualifications - List qualifications for the caller's org.
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
      const orgId = req.orgId!;

      const conditions = [eq(qualificationRequests.orgId, orgId)];
      if (sourceOrgId) {
        conditions.push(eq(qualificationRequests.sourceOrgId, String(sourceOrgId)));
      }

      const results = await db
        .select({
          qualification: qualifications,
          request: qualificationRequests,
        })
        .from(qualifications)
        .innerJoin(
          qualificationRequests,
          eq(qualifications.requestId, qualificationRequests.id),
        )
        .where(and(...conditions))
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
        })),
      );
    } catch (error) {
      console.error("[reply-qualification-service] list qualifications error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
