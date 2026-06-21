const RUNS_SERVICE_URL =
  process.env.RUNS_SERVICE_URL || "https://runs.mcpfactory.org";
const RUNS_SERVICE_API_KEY = process.env.RUNS_SERVICE_API_KEY;

async function runsApiFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  if (!RUNS_SERVICE_API_KEY) {
    throw new Error("RUNS_SERVICE_API_KEY is not set");
  }

  const res = await fetch(`${RUNS_SERVICE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": RUNS_SERVICE_API_KEY,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `[replies-service] runs-service ${method} ${path} failed (${res.status}): ${text}`
    );
  }

  return res.json() as Promise<T>;
}

export interface RunsServiceRun {
  id: string;
  organizationId: string;
  userId: string | null;
  brandId: string | null;
  campaignId: string | null;
  audienceId: string | null;
  serviceName: string;
  taskName: string;
  status: string;
  parentRunId: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunParams {
  orgId: string;
  userId?: string;
  brandId?: string;
  campaignId?: string;
  audienceId?: string;
  parentRunId?: string;
  metadata?: Record<string, unknown>;
}

export async function createRun(
  params: CreateRunParams
): Promise<RunsServiceRun> {
  return runsApiFetch<RunsServiceRun>("POST", "/v1/runs", {
    orgId: params.orgId,
    ...(params.userId && { userId: params.userId }),
    ...(params.brandId && { brandId: params.brandId }),
    ...(params.campaignId && { campaignId: params.campaignId }),
    ...(params.audienceId && { audienceId: params.audienceId }),
    serviceName: "replies-service",
    taskName: "replies-service",
    ...(params.parentRunId && { parentRunId: params.parentRunId }),
    ...(params.metadata && { metadata: params.metadata }),
  });
}

export async function updateRunStatus(
  runId: string,
  status: "completed" | "failed"
): Promise<RunsServiceRun> {
  return runsApiFetch<RunsServiceRun>("PATCH", `/v1/runs/${runId}`, {
    status,
  });
}
