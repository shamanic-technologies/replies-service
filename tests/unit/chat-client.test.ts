import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.stubEnv("CHAT_SERVICE_URL", "https://chat.test.local");
vi.stubEnv("CHAT_SERVICE_API_KEY", "test-chat-key");

const { qualifyReply } = await import("../../src/lib/chat-client.js");

const baseIdentity = {
  orgId: "org_abc",
  userId: "user_xyz",
  runId: "run_parent_1",
};

const okJsonResponse = {
  content: "{...}",
  json: {
    classification: "interested",
    confidence: 0.85,
    reasoning: "Positive reply",
    suggested_action: "forward_to_client",
    extracted_details: { foo: "bar" },
  },
  tokensInput: 150,
  tokensOutput: 50,
  model: "gemini-flash-lite-001",
};

describe("chat-client — qualifyReply", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls POST /complete with provider=google, model=flash-lite, responseFormat=json", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(okJsonResponse),
    });

    const result = await qualifyReply({
      subject: "Re: Demo",
      bodyText: "Yes interested.",
      bodyHtml: null,
      identity: baseIdentity,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://chat.test.local/complete");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.provider).toBe("google");
    expect(body.model).toBe("flash-lite");
    expect(body.responseFormat).toBe("json");
    expect(body.systemPrompt).toMatch(/classif/i);
    expect(body.message).toContain("Re: Demo");
    expect(body.message).toContain("Yes interested.");

    expect(result.classification).toBe("interested");
    expect(result.confidence).toBe(0.85);
    expect(result.suggestedAction).toBe("forward_to_client");
    expect(result.inputTokens).toBe(150);
    expect(result.outputTokens).toBe(50);
    expect(result.model).toBe("gemini-flash-lite-001");
  });

  it("forwards identity headers to chat-service", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(okJsonResponse),
    });

    await qualifyReply({
      subject: "S",
      bodyText: "B",
      bodyHtml: null,
      identity: {
        ...baseIdentity,
        campaignId: "camp_1",
        brandId: "brand_1",
        workflowSlug: "wf-x",
        featureSlug: "feat-y",
      },
    });

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["x-api-key"]).toBe("test-chat-key");
    expect(headers["x-org-id"]).toBe("org_abc");
    expect(headers["x-user-id"]).toBe("user_xyz");
    expect(headers["x-run-id"]).toBe("run_parent_1");
    expect(headers["x-campaign-id"]).toBe("camp_1");
    expect(headers["x-brand-id"]).toBe("brand_1");
    expect(headers["x-workflow-slug"]).toBe("wf-x");
    expect(headers["x-feature-slug"]).toBe("feat-y");
  });

  it("uses bodyHtml when bodyText is missing (strips tags)", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(okJsonResponse),
    });

    await qualifyReply({
      subject: null,
      bodyText: null,
      bodyHtml: "<p>Hello <b>world</b></p>",
      identity: baseIdentity,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.message).toContain("Hello world");
    expect(body.message).not.toContain("<p>");
  });

  it("throws when chat-service returns 502", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve('{"error":"LLM call failed."}'),
    });

    await expect(
      qualifyReply({
        subject: "S",
        bodyText: "B",
        bodyHtml: null,
        identity: baseIdentity,
      }),
    ).rejects.toThrow(/chat-service.*502/i);
  });

  it("throws when json field is missing in response (fail loud)", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          content: "raw text only",
          tokensInput: 10,
          tokensOutput: 5,
          model: "x",
        }),
    });

    await expect(
      qualifyReply({
        subject: "S",
        bodyText: "B",
        bodyHtml: null,
        identity: baseIdentity,
      }),
    ).rejects.toThrow(/json/i);
  });

  it("throws when classification field missing in json (fail loud)", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          content: "{}",
          json: { confidence: 0.5 },
          tokensInput: 10,
          tokensOutput: 5,
          model: "x",
        }),
    });

    await expect(
      qualifyReply({
        subject: "S",
        bodyText: "B",
        bodyHtml: null,
        identity: baseIdentity,
      }),
    ).rejects.toThrow(/classification/i);
  });

  it("throws when CHAT_SERVICE_API_KEY is not set", async () => {
    vi.stubEnv("CHAT_SERVICE_API_KEY", "");
    vi.resetModules();
    const mod = await import("../../src/lib/chat-client.js");

    await expect(
      mod.qualifyReply({
        subject: "S",
        bodyText: "B",
        bodyHtml: null,
        identity: baseIdentity,
      }),
    ).rejects.toThrow(/CHAT_SERVICE_API_KEY/);

    vi.stubEnv("CHAT_SERVICE_API_KEY", "test-chat-key");
  });
});
