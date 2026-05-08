import { Request, Response, NextFunction } from "express";
import { createRun, updateRunStatus } from "../lib/runs-service.js";

export interface AuthenticatedRequest extends Request {
  /** Caller's run ID from inbound x-run-id header. */
  parentRunId?: string;
  /** This service's own run ID, created by middleware. */
  runId?: string;
  orgId?: string;
  userId?: string;
  brandId?: string;
  campaignId?: string;
  featureSlug?: string;
  workflowSlug?: string;
}

/**
 * API key auth. Crashes at startup if REPLIES_SERVICE_API_KEY env is missing.
 */
const REPLIES_SERVICE_API_KEY = process.env.REPLIES_SERVICE_API_KEY;
if (!REPLIES_SERVICE_API_KEY && process.env.NODE_ENV !== "test") {
  // Test setup intentionally injects the key; production must crash.
  throw new Error("REPLIES_SERVICE_API_KEY env var is required");
}

export function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  const validKey = process.env.REPLIES_SERVICE_API_KEY;

  if (!validKey) {
    res.status(500).json({ error: "Service misconfigured: missing API key env" });
    return;
  }

  if (!apiKey || apiKey !== validKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

/**
 * Reads identity headers (only x-org-id required), creates a run via runs-service,
 * and registers a response-finish hook to close the run.
 */
export function requireOrgId(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const orgId = req.headers["x-org-id"] as string | undefined;
  if (!orgId) {
    res.status(400).json({ error: "Missing x-org-id header" });
    return;
  }

  req.orgId = orgId;
  req.userId = (req.headers["x-user-id"] as string) || undefined;
  req.parentRunId = (req.headers["x-run-id"] as string) || undefined;
  req.brandId = (req.headers["x-brand-id"] as string) || undefined;
  req.campaignId = (req.headers["x-campaign-id"] as string) || undefined;
  req.featureSlug = (req.headers["x-feature-slug"] as string) || undefined;
  req.workflowSlug = (req.headers["x-workflow-slug"] as string) || undefined;

  // Create own run. Must succeed — fail loud per service-architecture.
  createRun({
    orgId: req.orgId,
    userId: req.userId,
    brandId: req.brandId,
    campaignId: req.campaignId,
    parentRunId: req.parentRunId,
    metadata: {
      route: req.path,
      method: req.method,
      featureSlug: req.featureSlug,
      workflowSlug: req.workflowSlug,
    },
  })
    .then((run) => {
      req.runId = run.id;

      res.on("finish", () => {
        const status: "completed" | "failed" =
          res.statusCode >= 400 ? "failed" : "completed";
        updateRunStatus(run.id, status).catch((err) => {
          console.error("[replies-service] updateRunStatus failed:", err);
        });
      });

      next();
    })
    .catch((err) => {
      console.error("[replies-service] runs-service createRun failed:", err);
      res.status(502).json({ error: "Failed to create run in runs-service" });
    });
}
