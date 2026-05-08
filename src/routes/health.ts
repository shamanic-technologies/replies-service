import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "replies-service",
    timestamp: new Date().toISOString(),
  });
});

router.get("/health/debug", async (_req, res) => {
  const apiKey = process.env.REPLIES_SERVICE_API_KEY;
  const dbUrl = process.env.REPLIES_SERVICE_DATABASE_URL;
  const runsServiceConfigured =
    !!process.env.RUNS_SERVICE_URL && !!process.env.RUNS_SERVICE_API_KEY;

  let dbStatus = "unknown";
  try {
    await db.execute(sql`SELECT 1`);
    dbStatus = "connected";
  } catch (e: any) {
    dbStatus = `error: ${e.message}`;
  }

  res.json({
    apiKeyConfigured: !!apiKey,
    apiKeyLength: apiKey?.length || 0,
    apiKeyPrefix: apiKey?.substring(0, 4) || "none",
    dbUrlConfigured: !!dbUrl,
    dbStatus,
    runsServiceConfigured,
  });
});

export default router;
