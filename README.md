# Reply Qualification Service

AI-powered email reply classification service. Analyzes incoming email replies to sales/outreach campaigns using Claude AI and classifies them into actionable categories.

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
  "costUsd": 0.000123,
  "keySource": "platform",
  "serviceRunId": "uuid-or-null",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

### `GET /qualifications/:id`

Fetch a specific qualification result by ID.

### `GET /qualifications`

List qualifications with optional filters: `sourceService`, `sourceOrgId`, `sourceRefId`, `limit` (default 50).

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
  "totalCostUsd": 1.234567,
  "totalInputTokens": 500000,
  "totalOutputTokens": 125000
}
```

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
| `KEY_SERVICE_URL` | Key-service base URL (default: `https://keys.mcpfactory.org`) |
| `KEY_SERVICE_API_KEY` | API key for key-service |
| `REPLY_QUALIFICATION_SERVICE_API_KEY` | Service-to-service auth key |
| `RUNS_SERVICE_URL` | RunsService base URL (default: `https://runs.mcpfactory.org`) |
| `RUNS_SERVICE_API_KEY` | API key for RunsService |
| `SERVICE_URL` | Public URL for OpenAPI spec (e.g. `https://reply-qualification.mcpfactory.org`) |
| `PORT` | Server port (default: 3000) |

## Database

Uses Drizzle ORM with PostgreSQL (Neon). Migrations run automatically on startup.

**Tables:** `qualification_requests`, `qualifications`, `webhook_callbacks`

Run tracking and cost logging are delegated to [RunsService](https://runs.mcpfactory.org) — the `serviceRunId` column in `qualification_requests` links back to the external run.

```bash
npm run db:generate   # Generate migrations from schema changes
npm run db:migrate    # Run migrations
npm run db:studio     # Open Drizzle Studio
```

## Key Resolution

API keys are resolved automatically through key-service at runtime:

```
GET /keys/anthropic/decrypt?orgId=<orgId>&userId=<userId>
```

key-service auto-resolves whether to use the org's own key or the platform key based on the org's preference. The response includes a `keySource` field (`"platform"` or `"org"`) indicating which key was used. This `keySource` value is passed as `costSource` when declaring costs to runs-service.

No raw API keys are sent in request bodies. No `appId` or `keySource` fields are needed in requests.

## Auth

Service-to-service authentication requires four headers:
- `X-API-Key` — service API key
- `x-org-id` — internal org UUID (from client-service)
- `x-user-id` — internal user UUID (from client-service)
- `x-run-id` — caller's run ID (used as parentRunId when creating this service's own run in runs-service)

Optionally pass `X-Source-Service` to identify the calling service.

## AI Model

Uses Claude 3 Haiku (`claude-3-haiku-20240307`) for cost-effective classification. Pricing: $0.25/1M input tokens, $1.25/1M output tokens.

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
- **AI:** Anthropic Claude 3 Haiku (keys resolved via key-service)
- **Key Management:** key-service (auto-resolves org vs platform keys)
- **Testing:** Vitest + Supertest
- **Validation:** Zod + `@asteasolutions/zod-to-openapi`
- **CI:** GitHub Actions (unit + integration tests on push/PR to main)
