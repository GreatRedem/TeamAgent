import { OpenRouterCore } from '@openrouter/sdk/core.js';
import { chatSend } from '@openrouter/sdk/funcs/chatSend.js';
import { OpenRouterError } from '@openrouter/sdk/models/errors/openroutererror.js';

import type { ChatMessage } from './agent.reply.js';

/**
 * How one completion leaves this server.
 *
 * Two transports, one seam. OpenRouter-hosted models go through the vendor SDK;
 * everything else -- a self-hosted endpoint, AgentRouter, any compatible root --
 * goes through plain `fetch` as it always has. Both return the **same
 * OpenAI-shaped payload**, which is the whole point: the reply loop keeps one
 * path, and context trimming, the tool-refusal retry, exchange recording and
 * the audit trail are written once rather than per provider.
 *
 * Both can also stream, and the caller cannot tell which one did: a streamed
 * answer is assembled back into exactly the payload an unstreamed one would
 * have produced, so nothing downstream has a second shape to understand.
 *
 * This is a deliberate exception to the rule that OpenRouter is a default
 * rather than an integration. The rule still holds everywhere else -- a model
 * added through OpenRouter is an ordinary `team_model` row, the probe and the
 * catalog cannot tell it apart -- but the reply path now can. Keeping the
 * difference inside this file is what stops that spreading: nothing downstream
 * of `sendCompletion` knows which transport answered.
 */

export interface CompletionRequest
{
    baseUrl: string;
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    maxTokens: number;
    /** Already in the vendor's format; omitted entirely when nothing is granted. */
    tools?: unknown[];
    timeoutMs: number;
    /**
     * Called with the whole answer so far, each time more of it arrives.
     *
     * Passing it asks for streaming. A provider that cannot stream is not an
     * error -- the request is simply made again without it and this is never
     * called -- so a caller showing progress must cope with going straight from
     * nothing to a finished answer.
     */
    onText?: (text: string) => void;
}

export interface CompletionResult
{
    ok: boolean;
    /** 0 when the request never got an answer at all. */
    status: number;
    /** OpenAI-shaped whichever transport produced it, including on failure. */
    payload: unknown;
    /** Whether the answer arrived in pieces. For the record, not for the logic. */
    streamed?: boolean;
}

/**
 * Whether this endpoint is OpenRouter itself.
 *
 * Matched on the host rather than the whole url: the stored root carries a path
 * (`/api/v1`) that a proxy or a future version could change, and a substring
 * test would also match a host that merely contains the name.
 */
export function isOpenRouter(baseUrl: string): boolean
{
    try
    {
        const host = new URL(baseUrl).hostname.toLowerCase();

        return host === 'openrouter.ai' || host.endsWith('.openrouter.ai');
    }
    catch
    {
        return false;
    }
}

/** One tool call being rebuilt from the fragments a stream delivers it in. */
interface CallParts
{
    id: string;
    type: string;
    name: string;
    arguments: string;
}

/**
 * Rebuilds a whole completion from the pieces a stream sends.
 *
 * Content is the easy half. Tool calls arrive as fragments addressed by
 * `index` -- the name in one chunk, the arguments a few characters at a time
 * across many -- so they are accumulated per index and only make sense once the
 * stream has ended. Getting this wrong yields a call whose JSON arguments are
 * truncated, which then fails at the point of use rather than here.
 */
export function createAssembler(onText?: (text: string) => void)
{
    const calls = new Map<number, CallParts>();

    let text = '';
    let usage: unknown;
    let finishReason: unknown;

    return {
        chunk(delta: unknown, chunkUsage: unknown, reason: unknown)
        {
            if (chunkUsage !== undefined && chunkUsage !== null)
            {
                usage = chunkUsage;
            }

            if (reason !== undefined && reason !== null)
            {
                finishReason = reason;
            }

            if (typeof delta !== 'object' || delta === null)
            {
                return;
            }

            const source = delta as { content?: unknown; tool_calls?: unknown; toolCalls?: unknown };

            if (typeof source.content === 'string' && source.content !== '')
            {
                text += source.content;

                onText?.(text);
            }

            // Whichever casing the transport speaks. The fragments inside are
            // named the same either way.
            const fragments = Array.isArray(source.tool_calls) ? source.tool_calls
                : Array.isArray(source.toolCalls) ? source.toolCalls
                    : [ ];

            for (const [ at, raw ] of fragments.entries())
            {
                if (typeof raw !== 'object' || raw === null)
                {
                    continue;
                }

                const fragment = raw as { index?: unknown; id?: unknown; type?: unknown; function?: { name?: unknown; arguments?: unknown } };

                // Position is the fallback: a provider that omits `index` sends
                // its calls in order, and keying every fragment to 0 would weld
                // separate calls into one.
                const index = typeof fragment.index === 'number' ? fragment.index : at;
                const entry = calls.get(index) ?? { id: '', type: 'function', name: '', arguments: '' };

                if (typeof fragment.id === 'string' && fragment.id !== '')
                {
                    entry.id = fragment.id;
                }

                if (typeof fragment.type === 'string' && fragment.type !== '')
                {
                    entry.type = fragment.type;
                }

                if (typeof fragment.function?.name === 'string')
                {
                    entry.name += fragment.function.name;
                }

                if (typeof fragment.function?.arguments === 'string')
                {
                    entry.arguments += fragment.function.arguments;
                }

                calls.set(index, entry);
            }
        },

        /** Exactly what the same request would have returned unstreamed. */
        payload(): unknown
        {
            const assembled = [ ...calls.entries() ]
                .sort(([ a ], [ b ]) => a - b)
                .map(([ , call ]) => ({ id: call.id, type: call.type, function: { name: call.name, arguments: call.arguments } }))
                .filter((call) => call.function.name !== '');

            return {
                choices: [ {
                    finish_reason: finishReason ?? null,
                    message: {
                        role: 'assistant',
                        content: text,
                        ...assembled.length > 0 && { tool_calls: assembled }
                    }
                } ],
                ...usage !== undefined && { usage }
            };
        }
    };
}

function send(request: CompletionRequest, stream: boolean): Promise<Response>
{
    return fetch(`${ request.baseUrl }/chat/completions`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...request.apiKey === '' ? { } : { authorization: `Bearer ${ request.apiKey }` }
        },
        body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            max_tokens: request.maxTokens,
            // Omitted rather than sent empty: some compatible servers reject an
            // empty tools array outright.
            ...request.tools !== undefined && { tools: request.tools },
            // Usage arrives only in the final chunk, and only if asked for.
            ...stream && { stream: true, stream_options: { include_usage: true } }
        }),
        signal: AbortSignal.timeout(request.timeoutMs) });
}

/**
 * Status 0 says "never answered", which is different from a refusal.
 *
 * The SDK reports transport failure as a value and `fetch` throws, so both are
 * funnelled through here -- a seam whose two sides fail differently is not a
 * seam, and the caller would have to know which transport it was talking to.
 */
function unreachable(cause: unknown): CompletionResult
{
    return {
        ok: false,
        status: 0,
        payload: { error: { message: cause instanceof Error ? cause.message : 'request failed' } }
    };
}

/** The compatible path, unstreamed. */
async function viaFetch(request: CompletionRequest): Promise<CompletionResult>
{
    let response: Response;

    try
    {
        response = await send(request, false);
    }
    catch (cause)
    {
        return unreachable(cause);
    }

    return {
        ok: response.ok,
        status: response.status,
        payload: await response.json().catch(() => undefined)
    };
}

/**
 * The compatible path, streamed as server-sent events.
 *
 * Parsed by hand rather than with a library: it is one framing rule -- lines
 * beginning `data:`, a blank line between events, the literal `[DONE]` at the
 * end -- and a dependency for that would be more to keep current than to keep.
 */
async function viaFetchStream(request: CompletionRequest): Promise<CompletionResult>
{
    let response: Response;

    try
    {
        response = await send(request, true);
    }
    catch (cause)
    {
        return unreachable(cause);
    }

    if (!response.ok || response.body === null)
    {
        // Handed back unjudged: the body is the provider's own refusal and may
        // be about the model rather than about streaming.
        return { ok: false, status: response.status, payload: await response.json().catch(() => undefined) };
    }

    const assembler = createAssembler(request.onText);
    const decoder = new TextDecoder();

    let buffer = '';

    try
    {
        for await (const piece of response.body)
        {
            buffer += decoder.decode(piece as Uint8Array, { stream: true });

            // Everything up to the last newline is complete. The remainder is
            // half an event and waits for the next read.
            const lines = buffer.split('\n');

            buffer = lines.pop() ?? '';

            for (const line of lines)
            {
                const trimmed = line.trim();

                if (!trimmed.startsWith('data:'))
                {
                    continue;
                }

                const data = trimmed.slice(5).trim();

                if (data === '' || data === '[DONE]')
                {
                    continue;
                }

                try
                {
                    const chunk = JSON.parse(data) as { choices?: Array<{ delta?: unknown; finish_reason?: unknown }>; usage?: unknown };

                    assembler.chunk(chunk.choices?.[0]?.delta, chunk.usage, chunk.choices?.[0]?.finish_reason);
                }
                catch
                {
                    // One unparseable event is not worth abandoning an answer
                    // that is otherwise arriving.
                }
            }
        }
    }
    catch (cause)
    {
        return unreachable(cause);
    }

    return { ok: true, status: response.status, payload: assembler.payload(), streamed: true };
}

/**
 * The SDK's parsed result, back in the shape that goes over the wire.
 *
 * It decodes `tool_calls` into a camelCase `toolCalls`, and everything that
 * reads a completion here -- `readToolCalls`, `readAssistantTurn` -- looks for
 * the wire name. Left unconverted, an agent's tool calls are invisible on this
 * path: the model asks for a tool, nothing sees the request, and it answers as
 * though it had none. The assistant turn is also pushed back into the next
 * request verbatim, so it has to be in the wire shape regardless.
 *
 * Only that one field is renamed. `id`, `type` and `function { name, arguments }`
 * already match, and spreading the rest keeps whatever the SDK adds later.
 */
function toWirePayload(result: unknown): unknown
{
    if (typeof result !== 'object' || result === null)
    {
        return result;
    }

    const choices = (result as { choices?: unknown }).choices;

    if (!Array.isArray(choices))
    {
        return result;
    }

    return {
        ...result,
        choices: choices.map((choice) =>
        {
            const message = typeof choice === 'object' && choice !== null ? (choice as { message?: unknown }).message : undefined;

            if (typeof message !== 'object' || message === null)
            {
                return choice;
            }

            const { toolCalls, ...rest } = message as { toolCalls?: unknown };

            return { ...choice, message: { ...rest, ...toolCalls !== undefined && { tool_calls: toolCalls } } };
        })
    };
}

function client(request: CompletionRequest): OpenRouterCore
{
    return new OpenRouterCore({
        apiKey: request.apiKey,
        serverURL: request.baseUrl,
        // Identifies this app in OpenRouter's dashboard rather than leaving the
        // traffic anonymous. Not a credential.
        appTitle: 'NuraAI'
    });
}

function fromSdkError(error: unknown): CompletionResult
{
    if (!(error instanceof OpenRouterError))
    {
        return unreachable(error);
    }

    try
    {
        return { ok: false, status: error.statusCode, payload: JSON.parse(error.body) };
    }
    catch
    {
        // A body that is not JSON still has to reach the loop as a reason, or
        // the failure reads as a silent agent.
        return { ok: false, status: error.statusCode, payload: { error: { message: error.message } } };
    }
}

/**
 * The vendor SDK path.
 *
 * `chatSend` is the standalone function rather than the client method because
 * it returns a result object instead of throwing, which matches how every
 * failure on this path is already handled -- a refusal is information the reply
 * loop reads, not an exception to unwind through.
 */
async function viaSdk(request: CompletionRequest): Promise<CompletionResult>
{
    const result = await chatSend(client(request), {
        chatRequest: {
            model: request.model,
            messages: request.messages as never,
            maxTokens: request.maxTokens,
            stream: false,
            ...request.tools !== undefined && { tools: request.tools as never }
        }
    }, { timeoutMs: request.timeoutMs });

    return result.ok
        ? { ok: true, status: 200, payload: toWirePayload(result.value) }
        : fromSdkError(result.error);
}

/** The SDK path, streamed. Its chunks are camelCase; the assembler takes both. */
async function viaSdkStream(request: CompletionRequest): Promise<CompletionResult>
{
    const result = await chatSend(client(request), {
        chatRequest: {
            model: request.model,
            messages: request.messages as never,
            maxTokens: request.maxTokens,
            stream: true,
            ...request.tools !== undefined && { tools: request.tools as never }
        }
    }, { timeoutMs: request.timeoutMs });

    if (!result.ok)
    {
        return fromSdkError(result.error);
    }

    const stream: unknown = result.value;

    // The response type covers both modes. `stream: true` selects the second,
    // but only at runtime is which one certain.
    if (!(Symbol.asyncIterator in Object(stream)))
    {
        return { ok: true, status: 200, payload: toWirePayload(stream) };
    }

    const assembler = createAssembler(request.onText);

    try
    {
        for await (const chunk of stream as AsyncIterable<{ choices?: Array<{ delta?: unknown; finishReason?: unknown; finish_reason?: unknown }>; usage?: unknown }>)
        {
            const choice = chunk.choices?.[0];

            assembler.chunk(choice?.delta, chunk.usage, choice?.finishReason ?? choice?.finish_reason);
        }
    }
    catch (cause)
    {
        return unreachable(cause);
    }

    return { ok: true, status: 200, payload: assembler.payload(), streamed: true };
}

/**
 * Sends one completion, streaming it when the caller asked and the provider
 * allows.
 *
 * A streamed attempt that fails **before producing anything** is retried
 * unstreamed: "this endpoint does not stream" and "this request was wrong"
 * arrive as the same rejection, and only one of them is worth giving up over.
 * Once any text has been shown the retry is skipped, because replaying the
 * request would make the answer appear twice.
 */
export async function sendCompletion(request: CompletionRequest): Promise<CompletionResult>
{
    const openRouter = isOpenRouter(request.baseUrl);

    if (request.onText === undefined)
    {
        return openRouter ? viaSdk(request) : viaFetch(request);
    }

    let shown = false;

    const watched: CompletionRequest = {
        ...request,
        onText: (text) =>
        {
            shown = true;

            request.onText?.(text);
        }
    };

    const streamed = openRouter ? await viaSdkStream(watched) : await viaFetchStream(watched);

    if (streamed.ok || shown)
    {
        return streamed;
    }

    const plain: CompletionRequest = { ...request, onText: undefined };

    return openRouter ? viaSdk(plain) : viaFetch(plain);
}
