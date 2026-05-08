import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { journalistReplies } from "../db/schema.js";
import {
  apiKeyAuth,
  requireOrgId,
  AuthenticatedRequest,
} from "../middleware/auth.js";
import {
  CreateJournalistReplySchema,
  PatchJournalistReplySchema,
  JournalistRepliesQuerySchema,
} from "../schemas.js";

const router = Router();

function serialize(row: typeof journalistReplies.$inferSelect) {
  return {
    id: row.id,
    journalistId: row.journalistId,
    campaignId: row.campaignId,
    brandId: row.brandId,
    orgId: row.orgId,
    userId: row.userId,
    parentRunId: row.parentRunId,
    runId: row.runId,
    status: row.status,
    source: row.source,
    setByUserId: row.setByUserId,
    note: row.note,
    fromEmail: row.fromEmail,
    toEmail: row.toEmail,
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml,
    inReplyToMessageId: row.inReplyToMessageId,
    emailReceivedAt: row.emailReceivedAt
      ? row.emailReceivedAt.toISOString()
      : null,
    publicationUrl: row.publicationUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * POST /orgs/journalist-replies
 * Create a new journalist reply row.
 */
router.post(
  "/orgs/journalist-replies",
  apiKeyAuth,
  requireOrgId,
  async (req: AuthenticatedRequest, res) => {
    const parsed = CreateJournalistReplySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;
    const orgId = req.orgId!;

    const [row] = await db
      .insert(journalistReplies)
      .values({
        journalistId: body.journalistId,
        campaignId: body.campaignId,
        brandId: body.brandId,
        orgId,
        userId: req.userId ?? null,
        parentRunId: req.parentRunId ?? null,
        runId: req.runId ?? null,
        status: body.status,
        source: body.source,
        setByUserId: body.source === "manual" ? req.userId ?? null : null,
        note: body.note ?? null,
        fromEmail: body.fromEmail ?? null,
        toEmail: body.toEmail ?? null,
        subject: body.subject ?? null,
        bodyText: body.bodyText ?? null,
        bodyHtml: body.bodyHtml ?? null,
        inReplyToMessageId: body.inReplyToMessageId ?? null,
        emailReceivedAt: body.emailReceivedAt
          ? new Date(body.emailReceivedAt)
          : null,
        publicationUrl: body.publicationUrl ?? null,
      })
      .returning();

    res.status(201).json(serialize(row));
  }
);

/**
 * GET /orgs/journalist-replies/current?journalistId=&campaignId=
 * Latest row for the (journalist, campaign) pair (org-scoped).
 */
router.get(
  "/orgs/journalist-replies/current",
  apiKeyAuth,
  requireOrgId,
  async (req: AuthenticatedRequest, res) => {
    const parsed = JournalistRepliesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid query",
        details: parsed.error.flatten(),
      });
    }
    const { journalistId, campaignId } = parsed.data;
    const orgId = req.orgId!;

    const [row] = await db
      .select()
      .from(journalistReplies)
      .where(
        and(
          eq(journalistReplies.orgId, orgId),
          eq(journalistReplies.journalistId, journalistId),
          eq(journalistReplies.campaignId, campaignId)
        )
      )
      .orderBy(desc(journalistReplies.createdAt))
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(serialize(row));
  }
);

/**
 * GET /orgs/journalist-replies?journalistId=&campaignId=
 * Full history for the (journalist, campaign) pair, newest first (org-scoped).
 */
router.get(
  "/orgs/journalist-replies",
  apiKeyAuth,
  requireOrgId,
  async (req: AuthenticatedRequest, res) => {
    const parsed = JournalistRepliesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid query",
        details: parsed.error.flatten(),
      });
    }
    const { journalistId, campaignId } = parsed.data;
    const orgId = req.orgId!;

    const rows = await db
      .select()
      .from(journalistReplies)
      .where(
        and(
          eq(journalistReplies.orgId, orgId),
          eq(journalistReplies.journalistId, journalistId),
          eq(journalistReplies.campaignId, campaignId)
        )
      )
      .orderBy(desc(journalistReplies.createdAt));

    res.json(rows.map(serialize));
  }
);

/**
 * PATCH /orgs/journalist-replies/:id
 * Correct an existing manual row. 409 on auto-source rows.
 */
router.patch(
  "/orgs/journalist-replies/:id",
  apiKeyAuth,
  requireOrgId,
  async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const parsed = PatchJournalistReplySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten(),
      });
    }
    const orgId = req.orgId!;

    const [existing] = await db
      .select()
      .from(journalistReplies)
      .where(
        and(
          eq(journalistReplies.id, id),
          eq(journalistReplies.orgId, orgId)
        )
      )
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    if (existing.source !== "manual") {
      return res.status(409).json({ error: "Cannot patch auto-source row" });
    }

    const updates: Partial<typeof journalistReplies.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.note !== undefined) updates.note = parsed.data.note;
    if (parsed.data.publicationUrl !== undefined)
      updates.publicationUrl = parsed.data.publicationUrl;

    const [row] = await db
      .update(journalistReplies)
      .set(updates)
      .where(
        and(
          eq(journalistReplies.id, id),
          eq(journalistReplies.orgId, orgId)
        )
      )
      .returning();

    res.json(serialize(row));
  }
);

export default router;
