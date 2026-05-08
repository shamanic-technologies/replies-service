import { describe, it, expect } from "vitest";
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../src/schemas.js";

describe("OpenAPI spec", () => {
  it("includes all /orgs/journalist-replies* paths", () => {
    const generator = new OpenApiGeneratorV3(registry.definitions);
    const doc = generator.generateDocument({
      openapi: "3.0.0",
      info: { title: "Replies Service", version: "1.0.0" },
    });
    const paths = Object.keys(doc.paths || {});
    expect(paths).toContain("/orgs/journalist-replies");
    expect(paths).toContain("/orgs/journalist-replies/current");
    expect(paths).toContain("/orgs/journalist-replies/{id}");
  });
});
