# Reply Qualification Service

AI-powered email reply classification service. Analyzes incoming email replies to sales/outreach campaigns using Gemini (via chat-service) and classifies them into actionable categories.

## API Endpoints

All authenticated endpoints require these headers:

| Header | Required | Description |
|---|---|---|
| `X-API-Key` | Yes | Service-to-service API key |
| `x-org-id` | Yes | Internal org UUID from client-service |
| `x-user-id` | Yes | Internal user UUID from client-service |
| `x-run-id` | Yes | Caller's run ID (used as parentRunId when creating this service's own run) |

### `POST /qualify`

Classify an email reply. Stores the request, runs AI classification, returns the result synchronously.

**Request body:**

| Field | Required | Description |
|---|---|---|
| `sourceService` | Yes | Service name (`mcpfactory`, `pressbeat`, etc.) |
| `sourceOrgId` | Yes | Source organization identifier |
| `sourceRefId` | No | Campaign run ID, pitch ID, etc. |
| `fromEmail` | Yes | Sender email address |
| `toEmail` | Yes | Recipient email address |
| `subject` | No | Email subject line |
| `bodyText` | No | Plain text email body |
| `bodyHtml` | No | HTML email body (stripped if no bodyText) |
| `inReplyToMessageId` | No | Original message ID for threading |
| `emailReceivedAt` | No | ISO 8601 timestamp |
| `webhookUrl` | No | Callback URL for async notification |
| `brandId` | No | Brand identifier |
| `campaignId` | No | Campaign identifier |

**Response:**

```json
{
  "id": "uuid",
  "requestId": "uuid",
  "classification": "willing_to_meet",
  "confidence": 0.95,
  "reasoning": "The person explicitly asked to schedule a call",
  "suggestedAction": "forward_to_client",
  "extractedDetails": { "meeting_preference": "Tuesday afternoon" },
  "serviceRunId": "uuid-or-null",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

LLM input/output token counts and cost are not returned in the response — they are logged on the chat-service child run (linked via `serviceRunId`).

### `GET /qualifications/:id`

Fetch a specific qualification result by ID. Scoped to the caller's `x-org-id` — returns 404 for qualifications belonging to other orgs.

### `GET /qualifications`

List qualifications scoped to the caller's `x-org-id`. Optional filters: `sourceOrgId`, `limit` (default 50).

### `GET /stats`

Aggregated qualification statistics. **At least one filter parameter is required** to prevent unscoped global queries.

**Query parameters (at least one required):**

| Param | Description |
|---|---|
| `orgId` | Filter by organization identifier |
| `userId` | Filter by user identifier |
| `brandId` | Filter by brand identifier |
| `campaignId` | Filter by campaign identifier |
| `runId` | Filter by run identifier |

**Response:**

```json
{
  "total": 1234,
  "byClassification": {
    "willing_to_meet": 45,
    "interested": 200,
    "not_interested": 500
  },
  "totalCostUsd": 0,
  "totalInputTokens": 500000,
  "totalOutputTokens": 125000
}
```

Note: `totalCostUsd` is no longer populated by this service since LLM costs are logged on chat-service child runs. Aggregate costs via runs-service `GET /v1/stats/costs`. Token counters remain as a per-service snapshot.

### `GET /openapi.json`

Returns the OpenAPI 3.0 spec for this service. No auth required. The spec is generated at build time from Zod schemas via `@asteasolutions/zod-to-openapi`.

### `GET /health`

Basic health check. No auth required.

### `GET /health/debug`

Debug endpoint showing env var status and DB connection. No auth required.

## Classifications

| Classification | Description |
|---|---|
| `willing_to_meet` | Wants to schedule a meeting or call |
| `interested` | Positive response, open to discussion |
| `needs_more_info` | Curious but needs clarification |
| `not_interested` | Polite decline |
| `out_of_office` | Auto-reply, vacation |
| `unsubscribe` | Wants to be removed |
| `bounce` | Email delivery failure |
| `other` | Uncategorized |

## Setup

```bash
npm install
cp .env.example .env  # Fill in values
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `REPLY_QUALIFICATION_SERVICE_DATABASE_URL` | Neon PostgreSQL connection string |
| `REPLY_QUALIFICATION_SERVICE_API_KEY` | Service-to-service auth key |
| `CHAT_SERVICE_URL` | chat-service base URL (default: `http://chat-service.railway.internal:8080`) |
| `CHAT_SERVICE_API_KEY` | API key for chat-service |
| `RUNS_SERVICE_URL` | runs-service base URL (default: `http://runs-service.railway.internal:8080`) |
| `RUNS_SERVICE_API_KEY` | API key for runs-service |
| `SERVICE_URL` | Public URL for OpenAPI spec |
| `PORT` | Server port (default: 3000) |

## Database

Uses Drizzle ORM with PostgreSQL (Neon). Migrations run automatically on startup.

**Tables:** `qualification_requests`, `qualifications`, `webhook_callbacks`

Run tracking is delegated to runs-service — the `serviceRunId` column in `qualification_requests` links back to the external run. LLM token costs are logged on the chat-service child run, not on this service's run.

```bash
npm run db:generate   # Generate migrations from schema changes
npm run db:migrate    # Run migrations
npm run db:studio     # Open Drizzle Studio
```

## LLM Calls

This service does not call LLM providers directly. All classification calls go through `POST /complete` on chat-service with `provider: "google"` and `model: "flash-lite"`. chat-service:
- Resolves the Google API key from key-service (org or platform, based on org preference).
- Creates a child run under our `serviceRunId` and logs LLM token costs there.
- Returns the parsed JSON classification.

No LLM provider keys, raw API keys, or cost calculations live in this service.

## Auth

Service-to-service authentication requires four headers:
- `X-API-Key` — service API key
- `x-org-id` — internal org UUID (from client-service)
- `x-user-id` — internal user UUID (from client-service)
- `x-run-id` — caller's run ID (used as parentRunId when creating this service's own run in runs-service)

Optionally pass `X-Source-Service` to identify the calling service.

## AI Model

Uses Gemini Flash-Lite (resolved by chat-service from the `flash-lite` alias) for cost-effective classification. Cost is logged on the chat-service child run under each `serviceRunId`.

## Testing

```bash
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests (needs DB)
```

## Docker

```bash
docker build -t reply-qualification-service .
docker run -p 3000:3000 --env-file .env reply-qualification-service
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript + generate OpenAPI spec |
| `npm start` | Run compiled output |
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests |
| `npm run test:integration` | Run integration tests |
| `npm run generate:openapi` | Generate OpenAPI spec |
| `npm run db:generate` | Generate DB migrations |
| `npm run db:migrate` | Run DB migrations |
| `npm run db:push` | Push schema directly to DB |
| `npm run db:studio` | Open Drizzle Studio |

## Tech Stack

- **Runtime:** Node 20, TypeScript (strict mode)
- **Framework:** Express 4
- **ORM:** Drizzle ORM + PostgreSQL (Neon)
- **LLM:** Gemini `flash-lite` via chat-service (provider+model resolved internally)
- **Run Tracking:** runs-service (parent run created here; chat-service creates a child run for the LLM call and logs costs there)
- **Testing:** Vitest + Supertest
- **Validation:** Zod + `@asteasolutions/zod-to-openapi`
- **CI:** GitHub Actions (unit + integration tests on push/PR to main and staging)
