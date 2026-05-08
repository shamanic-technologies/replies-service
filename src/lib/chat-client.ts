const CHAT_SERVICE_URL =
  process.env.CHAT_SERVICE_URL || "http://chat-service.railway.internal:8080";

export interface ChatIdentity {
  orgId: string;
  userId: string;
  runId: string;
  campaignId?: string;
  brandId?: string;
  workflowSlug?: string;
  featureSlug?: string;
}

export interface QualifyReplyOptions {
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  identity: ChatIdentity;
}

export interface QualifyReplyResult {
  classification: string;
  confidence: number;
  reasoning: string;
  suggestedAction: string;
  extractedDetails: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  model: string;
  responseRaw: unknown;
}

const SYSTEM_PROMPT = `You are an expert at analyzing email replies to sales/outreach emails.

Your task is to classify the reply and extract relevant information.

Classifications:
- willing_to_meet: The person explicitly wants to schedule a meeting or call
- interested: Positive response, open to discussion, but no meeting request yet
- needs_more_info: Curious but needs clarification before deciding
- not_interested: Polite decline or rejection
- out_of_office: Auto-reply, vacation, or temporary unavailability
- unsubscribe: Wants to be removed from communications
- bounce: Email delivery failure notification
- other: Doesn't fit any category

Respond in JSON format:
{
  "classification": "one of the above",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of why you chose this classification",
  "suggested_action": "forward_to_client | auto_reply | schedule_followup | remove_from_list | ignore",
  "extracted_details": {
    "meeting_preference": "if they mentioned preferred times",
    "phone_number": "if they provided one",
    "alternative_contact": "if they suggested someone else",
    "objection": "main objection if not interested",
    "return_date": "if out of office"
  }
}`;

function buildHeaders(identity: ChatIdentity): Record<string, string> {
  const apiKey = process.env.CHAT_SERVICE_API_KEY;
  if (!apiKey) {
    throw new Error("CHAT_SERVICE_API_KEY is not set");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "x-org-id": identity.orgId,
    "x-user-id": identity.userId,
    "x-run-id": identity.runId,
  };
  if (identity.campaignId) headers["x-campaign-id"] = identity.campaignId;
  if (identity.brandId) headers["x-brand-id"] = identity.brandId;
  if (identity.workflowSlug) headers["x-workflow-slug"] = identity.workflowSlug;
  if (identity.featureSlug) headers["x-feature-slug"] = identity.featureSlug;
  return headers;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function qualifyReply(
  opts: QualifyReplyOptions,
): Promise<QualifyReplyResult> {
  const { subject, bodyText, bodyHtml, identity } = opts;
  const headers = buildHeaders(identity);

  const content = bodyText || stripHtml(bodyHtml || "");
  const message = `Subject: ${subject || "(no subject)"}\n\nEmail body:\n${content}`;

  const res = await fetch(`${CHAT_SERVICE_URL}/complete`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: "google",
      model: "flash-lite",
      responseFormat: "json",
      systemPrompt: SYSTEM_PROMPT,
      message,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `chat-service POST /complete failed (${res.status}): ${text}`,
    );
  }

  const data = (await res.json()) as {
    content: string;
    json?: Record<string, unknown>;
    tokensInput: number;
    tokensOutput: number;
    model: string;
  };

  if (!data.json || typeof data.json !== "object") {
    throw new Error(
      "chat-service /complete returned no parsed json field (responseFormat=json expected)",
    );
  }

  const parsed = data.json;
  if (typeof parsed.classification !== "string" || !parsed.classification) {
    throw new Error(
      "chat-service /complete json missing required field: classification",
    );
  }

  return {
    classification: parsed.classification,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    reasoning: String(parsed.reasoning || ""),
    suggestedAction: String(parsed.suggested_action || "ignore"),
    extractedDetails:
      (parsed.extracted_details as Record<string, unknown>) || {},
    inputTokens: data.tokensInput,
    outputTokens: data.tokensOutput,
    model: data.model,
    responseRaw: data,
  };
}
