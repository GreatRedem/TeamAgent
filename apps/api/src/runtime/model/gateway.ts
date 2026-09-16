/**
 * Model gateway boundary (docs/16-backend-architecture.md, docs/21-testing.md).
 *
 * Everything above this seam — policy, trust propagation, destination
 * resolution, budgets, audit — is deterministic and tested without a network
 * call. Tests mock here and only here, returning recorded or synthetic
 * responses including tool-call requests. Production wires the
 * OpenAI-compatible adapter; evals against real providers live outside CI.
 */

export interface GatewayMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface GatewayTool {
  /** Database row id of the granted tool. */
  id: string;
  name: string;
  description: string | null;
  inputSchema: unknown;
}

export interface GatewayToolCall {
  toolId: string;
  toolName: string;
  args: unknown;
  /** Explicit destination proposed by the model, if any (docs/17 C3). */
  destination: string | null;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GatewayResult {
  /** Assistant text. Present on final answers; may accompany a tool call. */
  text: string | null;
  /** Set when the model requests a tool. The runtime decides, never the model. */
  toolCall: GatewayToolCall | null;
  usage: TokenUsage;
}

export interface GatewayInvoke {
  model: { provider: string; name: string; version: string };
  messages: GatewayMessage[];
  tools: GatewayTool[];
  maxTokens?: number;
  signal: AbortSignal;
}

export interface ModelProvider {
  readonly name: string;
  invoke(input: GatewayInvoke): Promise<GatewayResult>;
}

export type GatewayErrorCode =
  | "MODEL_MISCONFIGURED"
  | "MODEL_PROVIDER_UNSUPPORTED"
  | "MODEL_PROVIDER_ERROR"
  | "MODEL_TIMEOUT"
  | "MODEL_PROTOCOL_ERROR";

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly retryable: boolean;

  constructor(code: GatewayErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Deterministic stand-in used by tests (and only by tests in production
 * builds): returns scripted results in order, then repeats the last one.
 * A script that always requests a tool is how budget tests build a runaway
 * loop without any inference.
 */
export class ScriptedProvider implements ModelProvider {
  readonly name = "scripted";
  private calls = 0;
  private script: GatewayResult[];
  private seen: GatewayInvoke[] = [];

  constructor(script: GatewayResult[]) {
    if (script.length === 0) throw new Error("ScriptedProvider requires at least one result.");
    this.script = [...script];
  }

  get callCount(): number {
    return this.calls;
  }

  /** Every invocation received, so tests can assert what entered the context. */
  get lastInput(): GatewayInvoke | null {
    const last = this.seen[this.seen.length - 1];
    return last ?? null;
  }

  /** Replace the script between tests; zeroes the call count and history. */
  reset(script: GatewayResult[]): void {
    if (script.length === 0) throw new Error("ScriptedProvider requires at least one result.");
    this.script = [...script];
    this.calls = 0;
    this.seen = [];
  }

  async invoke(input: GatewayInvoke): Promise<GatewayResult> {
    this.seen.push(input);
    const result = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls += 1;
    return {
      text: result?.text ?? null,
      toolCall:
        result?.toolCall === null || result?.toolCall === undefined ? null : { ...result.toolCall },
      usage: { ...result.usage },
    };
  }
}

/** Fail-closed default: a run without a configured provider fails loudly. */
export class UnconfiguredProvider implements ModelProvider {
  readonly name = "unconfigured";

  async invoke(_input: GatewayInvoke): Promise<GatewayResult> {
    throw new GatewayError(
      "MODEL_MISCONFIGURED",
      "No model provider is configured for this deployment.",
    );
  }
}

export function finalResult(
  text: string,
  usage: TokenUsage = { inputTokens: 0, outputTokens: 0 },
): GatewayResult {
  return { text, toolCall: null, usage };
}

export function toolResult(
  toolId: string,
  toolName: string,
  args: unknown,
  usage: TokenUsage = { inputTokens: 0, outputTokens: 0 },
  destination: string | null = null,
  text: string | null = null,
): GatewayResult {
  return { text, toolCall: { toolId, toolName, args, destination }, usage };
}

interface OpenAIOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Single provider integration for the MVP (docs/13-roadmap.md): any
 * OpenAI-compatible `/chat/completions` endpoint. Only the first tool call
 * is honored per iteration; the loop re-invokes, so nothing is lost, and
 * silently fanning out to N tools per inference would defeat the
 * per-iteration budget accounting.
 */
export class OpenAIChatProvider implements ModelProvider {
  readonly name = "openai";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: OpenAIOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async invoke(input: GatewayInvoke): Promise<GatewayResult> {
    if (input.model.provider !== "openai" && input.model.provider !== "openai-compatible") {
      throw new GatewayError(
        "MODEL_PROVIDER_UNSUPPORTED",
        `Model provider '${input.model.provider}' has no adapter; single-provider MVP serves 'openai'.`,
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal =
      input.signal.aborted || controller.signal.aborted
        ? AbortSignal.abort()
        : AbortSignal.any([input.signal, controller.signal]);
    try {
      const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: input.model.name,
          messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
          ...(input.tools.length > 0
            ? {
                tools: input.tools.map((t) => ({
                  type: "function",
                  function: {
                    name: t.name,
                    description: t.description ?? "",
                    parameters: t.inputSchema ?? { type: "object" },
                  },
                })),
                tool_choice: "auto",
              }
            : {}),
          ...(input.maxTokens === undefined ? {} : { max_tokens: input.maxTokens }),
        }),
        signal,
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") {
          throw new GatewayError("MODEL_TIMEOUT", "Model provider call timed out.", true);
        }
        throw new GatewayError(
          "MODEL_PROVIDER_ERROR",
          `Model provider unreachable: ${(error as Error).message}`,
          true,
        );
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new GatewayError(
          "MODEL_PROVIDER_ERROR",
          `Model provider returned HTTP ${response.status}.`,
          retryable,
        );
      }
      let body: OpenAIChatResponse;
      try {
        body = (await response.json()) as OpenAIChatResponse;
      } catch {
        throw new GatewayError("MODEL_PROTOCOL_ERROR", "Model provider returned invalid JSON.");
      }
      const message = body.choices?.[0]?.message;
      if (message === undefined) {
        throw new GatewayError("MODEL_PROTOCOL_ERROR", "Model provider returned no choices.");
      }
      const usage = {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      };
      const call = message.tool_calls?.[0]?.function;
      if (call?.name === undefined) {
        return { text: message.content ?? "", toolCall: null, usage };
      }
      const tool = input.tools.find((t) => t.name === call.name);
      if (tool === undefined) {
        throw new GatewayError(
          "MODEL_PROTOCOL_ERROR",
          `Model requested unknown tool '${call.name}'.`,
        );
      }
      let args: unknown;
      try {
        args = JSON.parse(call.arguments ?? "null");
      } catch {
        throw new GatewayError("MODEL_PROTOCOL_ERROR", "Model returned invalid tool arguments.");
      }
      return {
        text: message.content ?? null,
        toolCall: { toolId: tool.id, toolName: tool.name, args, destination: null },
        usage,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
