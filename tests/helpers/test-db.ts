import { db, sql } from "../../src/db/index.js";
import { journalistReplies } from "../../src/db/schema.js";

/**
 * Wipe all rows from journalist_replies. Used between integration tests.
 */
export async function cleanTestData() {
  await db.delete(journalistReplies);
}

/**
 * Close the postgres pool. Call once in afterAll.
 */
export async function closeDb() {
  await sql.end();
}

export function randomId(): string {
  return crypto.randomUUID();
}
