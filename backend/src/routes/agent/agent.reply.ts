export interface AgentDocumentLike
{
    name: string;
    content: string;
}

export interface HistoryMessage
{
    direction: string;
    text: string;
}

export interface ToolCall
{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

export interface ChatMessage
{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    tool_calls?: unknown;
}

export const MAX_TOOL_ROUNDS = 4;

export const HISTORY_LIMIT = 12;

export const TELEGRAM_TEXT_MAX = 4096;

export const MAX_COMPLETION_TOKENS = 2048;

export const ERROR_TEXT_MAX = 200;

export const DEFAULT_CONTEXT_TOKENS = 8192;

export const CONTEXT_MARGIN = 512;

const MESSAGE_OVERHEAD = 4;

const MIN_INPUT_BUDGET = 512;

export function estimateTokens(text: string): number
{
    return Math.ceil(text.length / 4);
}

function messageTokens(message: ChatMessage): number
{
    const calls = message.tool_calls === undefined ? 0 : estimateTokens(JSON.stringify(message.tool_calls));

    return estimateTokens(message.content) + calls + MESSAGE_OVERHEAD;
}

export function completionCap(contextTokens: number): number
{
    const total = contextTokens > 0 ? contextTokens : DEFAULT_CONTEXT_TOKENS;

    return Math.max(256, Math.min(MAX_COMPLETION_TOKENS, Math.floor(total / 2)));
}

export function contextBudget(contextTokens: number): number
{
    const total = contextTokens > 0 ? contextTokens : DEFAULT_CONTEXT_TOKENS;

    return Math.max(MIN_INPUT_BUDGET, total - completionCap(total) - CONTEXT_MARGIN);
}

function squeeze(messages: ChatMessage[], budget: number): ChatMessage[]
{
    const over = messages.reduce((sum, message) => sum + messageTokens(message), 0) - budget;

    if (over <= 0)
    {
        return messages;
    }

    const cut = (over + 16) * 4;
    const system = messages.findIndex((message) => message.role === 'system');
    const target = system === -1 ? messages.length - 1 : system;

    return messages.map((message, at) => at === target
        ? { ...message, content: message.content.slice(0, Math.max(0, message.content.length - cut)) }
        : message);
}

export function fitToContext(messages: ChatMessage[], contextTokens: number): ChatMessage[]
{
    if (messages.length === 0)
    {
        return messages;
    }

    const budget = contextBudget(contextTokens);

    const lead = messages[0].role === 'system' ? messages.slice(0, 1) : [ ];
    const rest = messages.slice(lead.length);
    const tail = rest.slice(-1);
    const middle = rest.slice(0, -1);

    let running = [ ...lead, ...middle, ...tail ].reduce((sum, message) => sum + messageTokens(message), 0);
    let start = 0;

    while (start < middle.length && running > budget)
    {
        running -= messageTokens(middle[start]);
        start += 1;
    }

    while (start < middle.length && middle[start].role === 'tool')
    {
        running -= messageTokens(middle[start]);
        start += 1;
    }

    const kept = [ ...lead, ...middle.slice(start), ...tail ];

    return running > budget ? squeeze(kept, budget) : kept;
}

export const ALWAYS_INLINE = [ 'instructions.md', 'guardrails.md' ];

export const DOCUMENT_INLINE_MAX = 400;

export function buildSystemPrompt(documents: AgentDocumentLike[], lazy = false): string
{
    const sorted = [ ...documents ].sort((a, b) =>
    {
        if (a.name === 'instructions.md')
        {
            return -1;
        }

        if (b.name === 'instructions.md')
        {
            return 1;
        }

        return a.name.localeCompare(b.name);
    });

    const inline = (document: AgentDocumentLike) =>
        !lazy || ALWAYS_INLINE.includes(document.name) || document.content.trim().length <= DOCUMENT_INLINE_MAX;

    const sections = sorted
        .filter(inline)
        .map((document) => document.content.trim())
        .filter((content) => content !== '');

    const deferred = sorted.filter((document) => !inline(document));

    if (deferred.length > 0)
    {
        sections.push([
            '# Your reference files',
            '',
            'The files below are not included here. Call `document_read` with the file name to read one when a question needs it. Do not guess at what they contain.',
            '',
            ...deferred.map((document) => `- ${ document.name } (${ document.content.trim().length } characters)`)
        ].join('\n'));
    }

    return sections.join('\n\n---\n\n');
}

export function earlierTurns<T extends { id: number }>(newestFirst: T[], messageId: number): T[]
{
    return [ ...newestFirst ].reverse().filter((message) => message.id !== messageId);
}

export function buildMessages(systemPrompt: string, history: HistoryMessage[], incoming: string): ChatMessage[]
{
    const messages: ChatMessage[] = [ ];

    if (systemPrompt !== '')
    {
        messages.push({ role: 'system', content: systemPrompt });
    }

    for (const message of history.slice(-HISTORY_LIMIT))
    {
        messages.push({ role: message.direction === 'out' ? 'assistant' : 'user', content: message.text });
    }

    messages.push({ role: 'user', content: incoming });

    return messages;
}

export function readCompletion(payload: unknown): string | undefined
{
    if (typeof payload !== 'object' || payload === null)
    {
        return undefined;
    }

    const choices = (payload as { choices?: unknown }).choices;

    if (!Array.isArray(choices) || choices.length === 0)
    {
        return undefined;
    }

    const message = (choices[0] as { message?: unknown }).message;

    if (typeof message !== 'object' || message === null)
    {
        return undefined;
    }

    const content = (message as { content?: unknown }).content;

    if (typeof content !== 'string' || content.trim() === '')
    {
        return undefined;
    }

    return content.trim().slice(0, TELEGRAM_TEXT_MAX);
}

export function isToolRefusal(payload: unknown): boolean
{
    const message = readError(payload).toLowerCase();

    if (message === '')
    {
        return false;
    }

    return /tool[ _-]?(use|call|compatib)/.test(message)
        || (message.includes('tool') && (message.includes('support') || message.includes('not available')));
}

export function readError(payload: unknown): string
{
    if (typeof payload !== 'object' || payload === null)
    {
        return '';
    }

    const error = (payload as { error?: unknown }).error;

    if (typeof error === 'string')
    {
        return error.trim().slice(0, ERROR_TEXT_MAX);
    }

    if (typeof error !== 'object' || error === null)
    {
        return '';
    }

    const message = (error as { message?: unknown }).message;

    return typeof message === 'string' ? message.trim().slice(0, ERROR_TEXT_MAX) : '';
}

export function readToolCalls(payload: unknown): ToolCall[]
{
    if (typeof payload !== 'object' || payload === null)
    {
        return [ ];
    }

    const choices = (payload as { choices?: unknown }).choices;

    if (!Array.isArray(choices) || choices.length === 0)
    {
        return [ ];
    }

    const message = (choices[0] as { message?: unknown }).message;

    if (typeof message !== 'object' || message === null)
    {
        return [ ];
    }

    const calls = (message as { tool_calls?: unknown }).tool_calls;

    if (!Array.isArray(calls))
    {
        return [ ];
    }

    const out: ToolCall[] = [ ];

    for (const raw of calls)
    {
        if (typeof raw !== 'object' || raw === null)
        {
            continue;
        }

        const id = (raw as { id?: unknown }).id;
        const fn = (raw as { function?: unknown }).function;

        if (typeof id !== 'string' || typeof fn !== 'object' || fn === null)
        {
            continue;
        }

        const name = (fn as { name?: unknown }).name;
        const rawArgs = (fn as { arguments?: unknown }).arguments;

        if (typeof name !== 'string')
        {
            continue;
        }

        let args: Record<string, unknown> = { };

        if (typeof rawArgs === 'string' && rawArgs.trim() !== '')
        {
            try
            {
                const parsed: unknown = JSON.parse(rawArgs);

                if (typeof parsed === 'object' && parsed !== null)
                {
                    args = parsed as Record<string, unknown>;
                }
            }
            catch
            {
                continue;
            }
        }
        else if (typeof rawArgs === 'object' && rawArgs !== null)
        {
            args = rawArgs as Record<string, unknown>;
        }

        out.push({ id, name, arguments: args });
    }

    return out;
}

export function readAssistantTurn(payload: unknown): unknown
{
    if (typeof payload !== 'object' || payload === null)
    {
        return undefined;
    }

    const choices = (payload as { choices?: unknown }).choices;

    return Array.isArray(choices) && choices.length > 0 ? (choices[0] as { message?: unknown }).message : undefined;
}
