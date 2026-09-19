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

export interface ChatMessage
{
    role: 'system' | 'user' | 'assistant';
    content: string;
}

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
