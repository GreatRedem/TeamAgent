import { describe, expect, it, vi } from "vitest";
import {
  finalResult,
  GatewayError,
  OpenAIChatProvider,
  ScriptedProvider,
  toolResult,
  UnconfiguredProvider,
} from "./gateway.js";

function stubFetch(response: { ok: boolean; status: number; json: unknown }): {
  fetchFn: typeof fetch;
  calls: Array<{ url: string; body: Record<string, unknown> }>;
} {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchFn = (async (url: unknown, init: unknown) => {
    const parsed = JSON.parse((init as { body: string }).body) as Record<string, unknown>;
    calls.push({ url: url as string, body: parsed });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.json,
    };
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

const invokeBase = {
  model: { provider: "openai", name: "mini", version: "1" },
  messages: [{ role: "user" as const, content: "hi" }],
  tools: [],
  signal: AbortSignal.timeout(1000),
};

describe("scripted provider", () => {
  it("replays results in order, then repeats the last", async () => {
    const provider = new ScriptedProvider([
      toolResult("t1", "http.fetch", { url: "https://example.com" }),
      finalResult("done"),
    ]);
    const first = await provider.invoke(invokeBase);
    expect(first.toolCall?.toolName).toBe("http.fetch");
    expect(await provider.invoke(invokeBase)).toMatchObject({ text: "done", toolCall: null });
    expect(await provider.invoke(invokeBase)).toMatchObject({ text: "done", toolCall: null });
    expect(provider.callCount).toBe(3);
  });

  it("fails closed when unconfigured", async () => {
    await expect(new UnconfiguredProvider().invoke(invokeBase)).rejects.toMatchObject({
      code: "MODEL_MISCONFIGURED",
    });
  });
});

describe("OpenAI-compatible provider", () => {
  it("maps messages and granted tools to chat completions", async () => {
    const { fetchFn, calls } = stubFetch({
      ok: true,
      status: 200,
      json: {
        choices: [{ message: { content: "hello" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      },
    });
    const provider = new OpenAIChatProvider({
      baseUrl: "https://llm.example.com/v1/",
      apiKey: "secret",
      fetchFn,
    });
    const result = await provider.invoke({
      ...invokeBase,
      tools: [{ id: "t1", name: "http.fetch", description: null, inputSchema: { type: "object" } }],
    });
    expect(result).toMatchObject({
      text: "hello",
      toolCall: null,
      usage: { inputTokens: 10, outputTokens: 4 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://llm.example.com/v1/chat/completions");
    const body = calls[0]?.body as { model: string; tools: Array<{ function: { name: string } }> };
    expect(body.model).toBe("mini");
    expect(body.tools.map((t) => t.function.name)).toEqual(["http.fetch"]);
  });

  it("maps the first tool call back to the granted tool id", async () => {
    const { fetchFn } = stubFetch({
      ok: true,
      status: 200,
      json: {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { function: { name: "http.fetch", arguments: '{"url":"https://x.io"}' } },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: {},
      },
    });
    const provider = new OpenAIChatProvider({
      baseUrl: "https://llm.example.com",
      apiKey: "s",
      fetchFn,
    });
    const result = await provider.invoke({
      ...invokeBase,
      tools: [{ id: "tool-row-id", name: "http.fetch", description: "Fetch", inputSchema: {} }],
    });
    expect(result.toolCall).toMatchObject({
      toolId: "tool-row-id",
      args: { url: "https://x.io" },
      destination: null,
    });
  });

  it("rejects unknown tools, bad payloads, and provider errors without retry confusion", async () => {
    const unknownTool = stubFetch({
      ok: true,
      status: 200,
      json: {
        choices: [{ message: { tool_calls: [{ function: { name: "evil", arguments: "{}" } }] } }],
        usage: {},
      },
    });
    const provider = new OpenAIChatProvider({
      baseUrl: "https://llm.example.com",
      apiKey: "s",
      fetchFn: unknownTool.fetchFn,
    });
    await expect(provider.invoke(invokeBase)).rejects.toMatchObject({
      code: "MODEL_PROTOCOL_ERROR",
    });

    const failing = stubFetch({ ok: false, status: 500, json: {} });
    const failingProvider = new OpenAIChatProvider({
      baseUrl: "https://llm.example.com",
      apiKey: "s",
      fetchFn: failing.fetchFn,
    });
    const error = await failingProvider.invoke(invokeBase).then(
      () => null,
      (e: unknown) => e as GatewayError,
    );
    expect(error).toBeInstanceOf(GatewayError);
    expect(error?.code).toBe("MODEL_PROVIDER_ERROR");
    expect(error?.retryable).toBe(true);

    const rateLimited = stubFetch({ ok: false, status: 429, json: {} });
    const limitedProvider = new OpenAIChatProvider({
      baseUrl: "https://llm.example.com",
      apiKey: "s",
      fetchFn: rateLimited.fetchFn,
    });
    await expect(limitedProvider.invoke(invokeBase)).rejects.toMatchObject({
      code: "MODEL_PROVIDER_ERROR",
      retryable: true,
    });
  });

  it("refuses to serve models with no adapter", async () => {
    const spy = vi.fn();
    const provider = new OpenAIChatProvider({
      baseUrl: "https://llm.example.com",
      apiKey: "s",
      fetchFn: spy as unknown as typeof fetch,
    });
    await expect(
      provider.invoke({ ...invokeBase, model: { provider: "other", name: "x", version: "1" } }),
    ).rejects.toMatchObject({ code: "MODEL_PROVIDER_UNSUPPORTED" });
    expect(spy).not.toHaveBeenCalled();
  });
});
