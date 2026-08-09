import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
}

describe("CI workflows", () => {
  it("regression: no workflow references Neon (the project no longer exists)", () => {
    const offenders = workflowFiles().filter((file) =>
      /neon/i.test(readFileSync(join(WORKFLOWS_DIR, file), "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("regression: integration tests run against a per-run Postgres service container", () => {
    const testWorkflow = readFileSync(join(WORKFLOWS_DIR, "test.yml"), "utf8");

    // A service container is created and destroyed with the job, so every run
    // gets a database nothing else points at.
    expect(testWorkflow).toMatch(/services:/);
    expect(testWorkflow).toMatch(/image:\s*postgres:\d+/);
    expect(testWorkflow).toMatch(/localhost:5432/);
  });

  it("regression: the integration job never points at a shared or long-lived database", () => {
    const testWorkflow = readFileSync(join(WORKFLOWS_DIR, "test.yml"), "utf8");

    // The database URL must be the local container, never a secret pointing at
    // a dev/staging/production instance.
    expect(testWorkflow).not.toMatch(/secrets\.[A-Z_]*DATABASE_URL/);
  });
});
