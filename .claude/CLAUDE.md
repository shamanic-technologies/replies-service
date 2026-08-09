# Project: reply-qualification-service

AI-powered email reply classification service. Uses Claude AI to classify incoming email replies into actionable categories (willing_to_meet, interested, not_interested, etc.).

## Commands

- `npm run dev` — local dev server with hot reload
- `npm run build` — compile TypeScript + generate OpenAPI spec
- `npm start` — run compiled output
- `npm test` — run all tests
- `npm run test:unit` — unit tests only
- `npm run test:integration` — integration tests (needs DB)
- `npm run generate:openapi` — regenerate openapi.json from Zod schemas
- `npm run db:generate` — generate Drizzle migrations
- `npm run db:migrate` — run migrations
- `npm run db:push` — push schema directly to DB
- `npm run db:studio` — open Drizzle Studio

## Architecture

- `src/schemas.ts` — Zod schemas (source of truth for validation + OpenAPI)
- `src/routes/qualify.ts` — POST /qualify endpoint (classification logic)
- `src/routes/stats.ts` — GET /stats aggregation endpoint
- `src/routes/health.ts` — Health check endpoints
- `src/db/schema.ts` — Drizzle ORM table definitions (qualification_requests, qualifications, webhook_callbacks)
- `src/db/index.ts` — Database connection
- `src/lib/anthropic.ts` — Claude AI client for classification
- `src/lib/runs-service.ts` — RunsService integration for cost tracking
- `src/middleware/auth.ts` — API key authentication middleware
- `src/config.ts` — Environment config
- `src/index.ts` — Express app entrypoint
- `scripts/ci-migrate.ts` — replays the drizzle journal onto CI's throwaway Postgres container (same migrator as boot)
- `tests/unit/` — Unit tests
- `tests/integration/` — Integration tests
- `openapi.json` — Auto-generated, do NOT edit manually

---

# Reply Qualification Service - Agent Rules

## README Maintenance (MANDATORY)

**Every time you make a meaningful change to this codebase, you MUST update README.md to reflect those changes.**

This applies when you:
- Add, modify, or remove API endpoints
- Change request/response schemas
- Add or remove environment variables
- Modify the database schema or add tables
- Change the AI model or classification categories
- Add or change npm scripts
- Update dependencies that affect the tech stack section
- Change authentication mechanisms
- Modify Docker configuration
- Change CI/CD workflows
- Add or remove test commands

### How to update the README

1. Read the current README.md first
2. Identify which sections are affected by your changes
3. Update only the relevant sections - keep it concise
4. Do NOT add sections that don't exist unless the change warrants it

### What NOT to update the README for

- Internal refactors that don't change external behavior
- Code style changes
- Test-only changes (unless test commands change)
- Dependency patch updates

## Regression Tests (MANDATORY)

**Every time you fix a bug or resolve an issue, you MUST create a regression test that:**

1. **Reproduces the original bug** — write a test that would FAIL on the old code
2. **Passes with the fix** — confirm the test passes after your changes
3. **Lives in the right place:**
   - Unit tests → `tests/unit/<module>.test.ts`
   - Integration tests → `tests/integration/<feature>.test.ts`
4. **Uses a clear name** — prefix with `regression:` or describe the issue, e.g.:
   ```
   it("regression: should not crash when reply body is empty", ...)
   ```

### When this applies

- Every bugfix
- Every issue resolution (even if it's a config/schema change — test the expected behavior)
- Edge cases discovered during development

### When this does NOT apply

- Pure refactors with no behavior change
- README/docs-only changes
- Dependency updates with no code changes

### CI enforcement

All tests run in CI via `npm run test:unit` and `npm run test:integration`. If your fix doesn't have a corresponding test, the PR should not be considered complete.

## Project Conventions

- TypeScript strict mode
- Functional patterns over classes
- Express 4 for HTTP
- Drizzle ORM for database
- Vitest for testing
- Keep solutions simple - no over-engineering
