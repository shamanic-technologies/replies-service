import express from "express";
import cors from "cors";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db/index.js";
import healthRoutes from "./routes/health.js";
import journalistRepliesRoutes from "./routes/journalist-replies.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/openapi.json", (_req, res) => {
  try {
    const specPath = resolve(__dirname, "../openapi.json");
    const spec = JSON.parse(readFileSync(specPath, "utf-8"));
    if (process.env.SERVICE_URL) {
      spec.servers = [{ url: process.env.SERVICE_URL }];
    }
    res.json(spec);
  } catch {
    res
      .status(404)
      .json({ error: "OpenAPI spec not found. Run npm run generate:openapi" });
  }
});

app.use(healthRoutes);
app.use(journalistRepliesRoutes);

if (process.env.NODE_ENV !== "test") {
  migrate(db, { migrationsFolder: "./drizzle" })
    .then(() => {
      console.log("Migrations complete");
      app.listen(Number(PORT), "::", () => {
        console.log(`replies-service running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

export default app;
