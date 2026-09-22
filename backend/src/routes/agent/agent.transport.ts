import { OpenRouterCore } from '@openrouter/sdk/core.js';
import { chatSend } from '@openrouter/sdk/funcs/chatSend.js';
import { OpenRouterError } from '@openrouter/sdk/models/errors/openroutererror.js';

import type { ChatMessage } from './agent.reply.js';

export interface CompletionRequest
{
    baseUrl: string;
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    maxTokens: number;
    tools?: unknown[];
    timeoutMs: number;
    onText?: (text: string) => void;
}

export interface CompletionResult
{
    ok: boolean;
    status: number;
    payload: unknown;
    streamed?: boolean;
}

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

interface CallParts
{
    id: string;
    type: string;
    name: string;
    arguments: string;
}

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
            ...request.tools !== undefined && { tools: request.tools },
            ...stream && { stream: true, stream_options: { include_usage: true } }
        }),
        signal: AbortSignal.timeout(request.timeoutMs) });
}

function unreachable(cause: unknown): CompletionResult
{
    return {
        ok: false,
        status: 0,
        payload: { error: { message: cause instanceof Error ? cause.message : 'request failed' } }
    };
}

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
        return { ok: false, status: error.statusCode, payload: { error: { message: error.message } } };
    }
}

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
