const RUNS_SERVICE_URL =
  process.env.RUNS_SERVICE_URL || "http://runs-service.railway.internal:8080";

async function runsApiFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const apiKey = process.env.RUNS_SERVICE_API_KEY;
  if (!apiKey) {
    throw new Error("RUNS_SERVICE_API_KEY is not set");
  }

  const res = await fetch(`${RUNS_SERVICE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunsService ${method} ${path} failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

export interface RunsServiceRun {
  id: string;
  organizationId: string;
  userId: string | null;
  brandId: string | null;
  campaignId: string | null;
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
  userId: string;
  brandId?: string;
  campaignId?: string;
  parentRunId?: string;
}

export async function createRun(
  params: CreateRunParams,
): Promise<RunsServiceRun> {
  return runsApiFetch<RunsServiceRun>("POST", "/v1/runs", {
    orgId: params.orgId,
    userId: params.userId,
    appId: "reply-qualification-service",
    ...(params.brandId && { brandId: params.brandId }),
    ...(params.campaignId && { campaignId: params.campaignId }),
    serviceName: "reply-qualification-service",
    taskName: "qualify-reply",
    ...(params.parentRunId && { parentRunId: params.parentRunId }),
  });
}

export async function updateRunStatus(
  runId: string,
  status: "completed" | "failed",
): Promise<RunsServiceRun> {
  return runsApiFetch<RunsServiceRun>("PATCH", `/v1/runs/${runId}`, {
    status,
  });
}
