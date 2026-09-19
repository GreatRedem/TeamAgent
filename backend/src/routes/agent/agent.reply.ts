/**
 * Turning an agent plus a conversation into a model request.
 *
 * Kept separate from the route handlers so the prompt composition can be
 * exercised on its own: what goes into the system prompt decides how the agent
 * behaves, and getting the document order or the history direction wrong is
 * invisible until someone reads a bad reply.
 */

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
    /** Set on a tool result, matching the call it answers. */
    tool_call_id?: string;
    /** Set on the assistant turn that requested tools, echoed back verbatim. */
    tool_calls?: unknown;
}

/** How many tool rounds an agent may take before it has to answer. */
export const MAX_TOOL_ROUNDS = 4;

/** How many past messages accompany the new one. */
export const HISTORY_LIMIT = 12;

/** Telegram rejects a message body over 4096 characters. */
export const TELEGRAM_TEXT_MAX = 4096;

/**
 * Concatenates an agent's markdown into one system prompt.
 *
 * `instructions.md` leads when present -- it is the document that says what the
 * agent is, and a model weights the opening of a system prompt most heavily.
 * Everything else follows in name order so the result is stable between calls
 * rather than depending on row order.
 */
export function buildSystemPrompt(documents: AgentDocumentLike[]): string
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

    return sorted
        .map((document) => document.content.trim())
        .filter((content) => content !== '')
        .join('\n\n---\n\n');
}

/**
 * Builds the message list for an OpenAI-compatible completion.
 *
 * History arrives oldest-first. Stored direction decides the role: 'out' is
 * what the agent said, so it maps to `assistant` -- feeding the agent's own
 * replies back as `user` would make it answer itself.
 */
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

/**
 * Pulls the reply text out of a completion response.
 *
 * Returns undefined rather than throwing on an unexpected shape: a
 * compatible-but-different server is a normal thing to meet, and the caller
 * logs a flat reason instead of a payload that might carry the API key back.
 */
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

/**
 * Pulls tool calls out of a completion.
 *
 * Arguments arrive as a JSON *string*, and a model will occasionally emit one
 * that does not parse. A call with unreadable arguments is dropped rather than
 * failing the whole turn -- the others may still be useful, and the model sees
 * only the results it gets back.
 */
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

/** The raw assistant turn, echoed back so the tool results have something to attach to. */
export function readAssistantTurn(payload: unknown): unknown
{
    if (typeof payload !== 'object' || payload === null)
    {
        return undefined;
    }

    const choices = (payload as { choices?: unknown }).choices;

    return Array.isArray(choices) && choices.length > 0 ? (choices[0] as { message?: unknown }).message : undefined;
}
