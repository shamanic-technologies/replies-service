/**
 * Build a database's schema by replaying the drizzle journal — the same
 * migrator the service runs at boot (src/index.ts).
 *
 * Used by CI against its throwaway Postgres container. Throws (exit 1) on the
 * first failing statement.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.REPLIES_SERVICE_DATABASE_URL;

if (!connectionString) {
  throw new Error("REPLIES_SERVICE_DATABASE_URL is not set");
}

const sql = postgres(connectionString, { max: 1 });

await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();

console.log("Migrations applied.");
