import { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  sourceService?: string;
  /** Set by serviceAuth middleware — always present after auth */
  orgId?: string;
  /** Set by serviceAuth middleware — always present after auth */
  userId?: string;
  /** Set by serviceAuth middleware — always present after auth */
  runId?: string;
}

/**
 * Service-to-service authentication via API key.
 * Also requires x-org-id and x-user-id identity headers.
 */
export function serviceAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.headers["x-api-key"] as string;

  if (!apiKey) {
    return res.status(401).json({ error: "Missing X-API-Key header" });
  }

  const validKey = process.env.REPLY_QUALIFICATION_SERVICE_API_KEY;

  if (!validKey || apiKey !== validKey) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  const orgId = req.headers["x-org-id"] as string;
  const userId = req.headers["x-user-id"] as string;

  if (!orgId) {
    return res.status(400).json({ error: "Missing x-org-id header" });
  }

  if (!userId) {
    return res.status(400).json({ error: "Missing x-user-id header" });
  }

  const runId = req.headers["x-run-id"] as string;

  if (!runId) {
    return res.status(400).json({ error: "Missing x-run-id header" });
  }

  req.orgId = orgId;
  req.userId = userId;
  req.runId = runId;
  req.sourceService = req.headers["x-source-service"] as string;

  next();
}
