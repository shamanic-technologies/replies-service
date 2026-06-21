# Replies Service

Persists journalist replies for outreach campaigns. Each row captures a snapshot of a reply (auto-classified from inbound webhooks or manually entered from the dashboard). The latest row per `(journalist_id, campaign_id)` represents the current effective status; history is preserved as additional rows.

## API Endpoints

All `/orgs/*` endpoints require:

| Header | Required | Description |
|---|---|---|
| `X-API-Key` | Yes | Service-to-service API key |
| `x-org-id` | Yes | Internal org UUID (from client-service) |
| `x-user-id` | No | Internal user UUID. Used as `setByUserId` when `source=manual` |
| `x-run-id` | No | Caller's run ID. Stored as `parent_run_id` |
| `x-brand-id` | No | Brand UUID(s) |
| `x-campaign-id` | No | Campaign UUID |
| `x-audience-id` | No | Audience attribution UUID. Stored as `audience_id` and forwarded to the runs-service run for per-audience cost attribution |
| `x-feature-slug` | No | Feature identifier |
| `x-workflow-slug` | No | Workflow identifier |

The service creates its own run via runs-service for every authenticated request, stored as `run_id`. When present, `x-audience-id` is included in that run declaration (`audienceId`) and persisted on the reply row (`audience_id`) so runs-service can attribute campaign cost per audience.

### `POST /orgs/journalist-replies`

Create a new reply row.

**Body:**

```json
{
  "journalistId": "j_123",
  "campaignId": "c_123",
  "brandId": "b_123",
  "status": "positive_for_earned",
  "source": "manual",
  "note": "optional",
  "publicationUrl": "https://example.com/article",
  "fromEmail": "journalist@outlet.com",
  "toEmail": "outreach@brand.com",
  "subject": "Re: pitch",
  "bodyText": "...",
  "bodyHtml": "...",
  "inReplyToMessageId": "<...>",
  "emailReceivedAt": "2026-05-08T12:00:00Z"
}
```

`setByUserId` is automatically derived from `x-user-id` when `source=manual`.

**Response:** `201 Created` with the persisted row.

### `GET /orgs/journalist-replies/current?journalistId=&campaignId=`

Returns the latest row for the (journalist, campaign) pair, scoped to `org_id`. `404` if none.

### `GET /orgs/journalist-replies?journalistId=&campaignId=`

Returns the full history (DESC by `created_at`), scoped to `org_id`.

### `PATCH /orgs/journalist-replies/:id`

Correct an existing row. Only allowed when `source=manual`.

**Body:** `{ status?, note?, publicationUrl? }`.

- `404` when the row does not belong to the caller's org.
- `409` when the row's `source = auto`.

### `GET /openapi.json`

OpenAPI 3.0 spec. No auth.

### `GET /health` / `GET /health/debug`

No auth.

## Reply statuses

| Status | Meaning |
|---|---|
| `positive_for_earned` | Open to earned coverage |
| `positive_for_paid` | Open to paid placement |
| `earned_publication_confirmed` | Earned article published |
| `paid_publication_confirmed` | Paid article published |
| `more_info_asked` | Wants additional details |
| `not_interested` | Polite decline |
| `unsubscribe` | Wants removal |
| `out_of_office` | Auto-reply |
| `bounced` | Email delivery failure |
| `other` | Uncategorized |

## Setup

```bash
npm install
cp .env.example .env  # fill in values
npm run dev
```

## Environment variables

| Variable | Description |
|---|---|
| `REPLIES_SERVICE_DATABASE_URL` | Neon Postgres connection string |
| `REPLIES_SERVICE_API_KEY` | Service-to-service auth key (crashes at startup if absent) |
| `RUNS_SERVICE_URL` | Runs-service base URL (default `https://runs.mcpfactory.org`) |
| `RUNS_SERVICE_API_KEY` | Runs-service API key |
| `SERVICE_URL` | Public URL injected into OpenAPI servers |
| `PORT` | Server port (default `3000`) |

## Database

Single table `journalist_replies` with two enums: `journalist_reply_status`, `journalist_reply_source`. Migrations run automatically on startup via `drizzle-orm/postgres-js/migrator`.

```bash
npm run db:generate   # generate migration from schema diff
npm run db:migrate    # apply pending migrations
npm run db:push       # push schema directly (skip migrations)
npm run db:studio     # open Drizzle Studio
```

## Testing

```bash
npm test                  # all
npm run test:unit         # unit only (no DB)
npm run test:integration  # integration (needs DB)
```

Integration tests run against a Neon branch in CI (`pr-<number>`). Locally, point `REPLIES_SERVICE_DATABASE_URL` at any Postgres and run `drizzle-kit push --force`.

## Tech stack

- Node 20, TypeScript strict
- Express 4
- Drizzle ORM + Postgres (Neon)
- Vitest + Supertest
- Zod + `@asteasolutions/zod-to-openapi`
- runs-service for run lifecycle + cost tracking

## Out of scope (future work)

- Inbound webhook handler that creates `source=auto` rows from email providers (Postmark/Instantly).
- API-service proxy endpoint so the dashboard can call this service indirectly.
