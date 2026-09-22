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
 * Ceiling on a single completion. Sent explicitly because a provider that is
 * told nothing assumes the model's full output ceiling and reserves credit for
 * it -- OpenRouter answers 402 for a balance that cannot cover 65536 tokens,
 * however short the actual reply would have been. The answer is truncated to
 * TELEGRAM_TEXT_MAX characters anyway, so anything past roughly a thousand
 * tokens is paid for and then thrown away.
 */
export const MAX_COMPLETION_TOKENS = 2048;

/** How much of a provider's error message reaches a log line. */
export const ERROR_TEXT_MAX = 200;

/**
 * What a model is assumed to hold when its window was never recorded.
 *
 * Deliberately pessimistic. Guessing high overruns a self-hosted 8k model,
 * which is the case this guard exists for and which fails as a flat provider
 * rejection; guessing low only drops history the owner can get back by
 * recording the real number on the model.
 */
export const DEFAULT_CONTEXT_TOKENS = 8192;

/**
 * Held back from the window on top of the reply itself.
 *
 * Covers the four-characters-a-token estimate being wrong in the expensive
 * direction, plus whatever framing the provider wraps each message in. A
 * request that overruns is refused outright, so the estimate has to be wrong
 * on the safe side.
 */
export const CONTEXT_MARGIN = 512;

/** Per-message framing around role and content, charged whatever it holds. */
const MESSAGE_OVERHEAD = 4;

/** Never trim the input below this: an agent with no room left cannot answer. */
const MIN_INPUT_BUDGET = 512;

/**
 * Roughly how many tokens a string costs.
 *
 * Real tokenisers differ per provider and none is available here without
 * shipping one per vendor, but prose runs about four characters to the token
 * across all of them. CONTEXT_MARGIN is what pays for the error.
 *
 * The UI labels documents with the same heuristic (`frontend/src/lib/tokens.ts`)
 * and the two are deliberately independent -- one guards a request, the other
 * is a hint on a screen.
 */
export function estimateTokens(text: string): number
{
    return Math.ceil(text.length / 4);
}

function messageTokens(message: ChatMessage): number
{
    // `tool_calls` is JSON on the wire and is charged like any other content,
    // so a round of calls is not invisible to the budget.
    const calls = message.tool_calls === undefined ? 0 : estimateTokens(JSON.stringify(message.tool_calls));

    return estimateTokens(message.content) + calls + MESSAGE_OVERHEAD;
}

/**
 * The reply cap this model can actually afford.
 *
 * Never more than half the window: asking a 4k model for a 2k answer leaves
 * the conversation that produced it fighting for the other half, and a request
 * whose `max_tokens` plus input exceeds the window is refused before a single
 * token is generated.
 */
export function completionCap(contextTokens: number): number
{
    const total = contextTokens > 0 ? contextTokens : DEFAULT_CONTEXT_TOKENS;

    return Math.max(256, Math.min(MAX_COMPLETION_TOKENS, Math.floor(total / 2)));
}

/** How much of the window the input may use, once the reply is paid for. */
export function contextBudget(contextTokens: number): number
{
    const total = contextTokens > 0 ? contextTokens : DEFAULT_CONTEXT_TOKENS;

    return Math.max(MIN_INPUT_BUDGET, total - completionCap(total) - CONTEXT_MARGIN);
}

/**
 * Last resort when the system prompt and the current question alone overrun
 * the window.
 *
 * The prompt is cut rather than the question: the question is what has to be
 * answered, and half a question gets a confident answer to something nobody
 * asked.
 */
function squeeze(messages: ChatMessage[], budget: number): ChatMessage[]
{
    const over = messages.reduce((sum, message) => sum + messageTokens(message), 0) - budget;

    if (over <= 0)
    {
        return messages;
    }

    // Back through the same four-to-one estimate, with a little extra so
    // rounding cannot leave it still over.
    const cut = (over + 16) * 4;
    const system = messages.findIndex((message) => message.role === 'system');
    const target = system === -1 ? messages.length - 1 : system;

    return messages.map((message, at) => at === target
        ? { ...message, content: message.content.slice(0, Math.max(0, message.content.length - cut)) }
        : message);
}

/**
 * Trims a message list to what the model can actually hold.
 *
 * The system prompt and the turn being answered are the two things a reply
 * cannot be built without, so only the history between them is negotiable and
 * it is dropped oldest-first -- the recent turns are the ones the answer
 * depends on.
 *
 * Applied on every round, not only the first: tool results are appended as the
 * loop runs, so a conversation that fitted when it started can overrun by the
 * time the model has read three files.
 */
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

    // A tool result whose assistant call has just been dropped is an orphan,
    // and an OpenAI-compatible endpoint rejects the whole request over one.
    while (start < middle.length && middle[start].role === 'tool')
    {
        running -= messageTokens(middle[start]);
        start += 1;
    }

    const kept = [ ...lead, ...middle.slice(start), ...tail ];

    return running > budget ? squeeze(kept, budget) : kept;
}

/**
 * Documents sent whether or not the model asks for them.
 *
 * `instructions.md` is what the agent *is*, and a guardrail the model only
 * reads when it happens to think of it is not a guardrail -- neither can be
 * deferred without changing how the agent behaves. Both are short by nature,
 * so deferring them would save almost nothing anyway.
 */
export const ALWAYS_INLINE = [ 'instructions.md', 'guardrails.md' ];

/**
 * Below this a document is cheaper to send than to fetch. A deferred file
 * costs the tool definition, the model's call, the result and a second
 * completion to use it -- easily more than a short file's own text, so
 * deferring the small ones would spend tokens to save tokens.
 */
export const DOCUMENT_INLINE_MAX = 400;

/**
 * Composes an agent's markdown into one system prompt.
 *
 * `instructions.md` leads when present -- it is the document that says what the
 * agent is, and a model weights the opening of a system prompt most heavily.
 * Everything else follows in name order so the result is stable between calls
 * rather than depending on row order.
 *
 * With `lazy`, only the behaviour-defining and short documents are sent; the
 * rest are replaced by a list of their names and sizes for the model to fetch
 * through `document_read` when a question actually needs one. A knowledge base
 * grows without bound and was being paid for on every message, including the
 * ones it had nothing to do with.
 *
 * Off by default, so a caller that cannot offer the tool keeps the whole
 * prompt rather than advertising files the model has no way to open.
 */
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
        // Sizes are given so the model can weigh opening a large file against
        // answering without it, and the names are exact so it does not have to
        // guess at a filename to pass back.
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

/**
 * The turns to replay before the current one, oldest-first.
 *
 * Rows come back newest-first from the database and the message being answered
 * is removed by **id**, never by position. It is not reliably the newest row:
 * a completion takes seconds, so a second message routinely lands while the
 * first reply is still being composed. Dropping the last row instead would
 * delete that newer message from the history and replay this one twice.
 */
export function earlierTurns<T extends { id: number }>(newestFirst: T[], messageId: number): T[]
{
    return [ ...newestFirst ].reverse().filter((message) => message.id !== messageId);
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
 * Whether a refusal was about the request carrying tools, rather than about
 * the conversation in it.
 *
 * A model with no tool-capable endpoint refuses the whole request before it
 * reads a word of it, so the person gets silence rather than an answer without
 * tools -- which is the answer they would have been happy with. OpenRouter
 * reports it as a 404 whose body names the failed routing step; other
 * compatible servers answer 400 and say it in prose. Both are matched on the
 * error text, because there is no status that means this and nothing else.
 *
 * Deliberately narrow. A false positive costs one retry without tools, but a
 * match on something broad like `404` would silently strip an agent's
 * capabilities every time a model name was misspelt.
 */
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

/**
 * The provider's own explanation of a failed call.
 *
 * An OpenAI-compatible error body is `{ error: { message } }`, and that message
 * is usually the only thing saying *why* -- a retired model slug, an exhausted
 * quota, a key without access. Without it the caller can only report that the
 * completion was unusable, which is true of every one of those causes.
 *
 * Returns an empty string for any other shape, so a body that is not an error
 * envelope contributes nothing rather than a fragment of itself.
 */
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
