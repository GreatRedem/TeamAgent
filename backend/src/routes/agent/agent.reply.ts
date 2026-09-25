import {
    ALWAYS_INLINE,
    ATTACHMENT_TOKENS,
    CONTEXT_MARGIN,
    DEFAULT_CONTEXT_TOKENS,
    DOCUMENT_INLINE_MAX,
    ERROR_TEXT_MAX,
    HISTORY_LIMIT,
    MAX_COMPLETION_TOKENS,
    MESSAGE_OVERHEAD,
    MIN_INPUT_BUDGET,
    PLUGIN_TOOLS,
    TELEGRAM_TEXT_MAX,
} from '../../constant.js';
export interface AgentDocumentLike {
    name: string;
    content: string;
}

export interface HistoryMessage {
    direction: string;
    text: string;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

export interface ContentPart {
    kind: 'image' | 'file';
    name: string;
    data: string;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    tool_calls?: unknown;
    parts?: ContentPart[];
}

export function recordable(messages: ChatMessage[]): unknown[] {
    return messages.map(({ parts, ...message }) =>
        parts === undefined
            ? message
            : {
                  ...message,
                  parts: parts.map((part) => ({
                      kind: part.kind,
                      name: part.name,
                      chars: part.data.length,
                  })),
              },
    );
}

export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function messageTokens(message: ChatMessage): number {
    const calls =
        message.tool_calls === undefined ? 0 : estimateTokens(JSON.stringify(message.tool_calls));

    return (
        estimateTokens(message.content) +
        calls +
        (message.parts?.length ?? 0) * ATTACHMENT_TOKENS +
        MESSAGE_OVERHEAD
    );
}

export function completionCap(contextTokens: number): number {
    const total = contextTokens > 0 ? contextTokens : DEFAULT_CONTEXT_TOKENS;

    return Math.max(256, Math.min(MAX_COMPLETION_TOKENS, Math.floor(total / 2)));
}

export function contextBudget(contextTokens: number): number {
    const total = contextTokens > 0 ? contextTokens : DEFAULT_CONTEXT_TOKENS;

    return Math.max(MIN_INPUT_BUDGET, total - completionCap(total) - CONTEXT_MARGIN);
}

function squeeze(messages: ChatMessage[], budget: number): ChatMessage[] {
    const over = messages.reduce((sum, message) => sum + messageTokens(message), 0) - budget;

    if (over <= 0) {
        return messages;
    }

    const cut = (over + 16) * 4;
    const system = messages.findIndex((message) => message.role === 'system');
    const target = system === -1 ? messages.length - 1 : system;

    return messages.map((message, at) =>
        at === target
            ? {
                  ...message,
                  content: message.content.slice(0, Math.max(0, message.content.length - cut)),
              }
            : message,
    );
}

export function fitToContext(messages: ChatMessage[], contextTokens: number): ChatMessage[] {
    if (messages.length === 0) {
        return messages;
    }

    const budget = contextBudget(contextTokens);

    const lead = messages[0].role === 'system' ? messages.slice(0, 1) : [];
    const rest = messages.slice(lead.length);
    const tail = rest.slice(-1);
    const middle = rest.slice(0, -1);

    let running = [...lead, ...middle, ...tail].reduce(
        (sum, message) => sum + messageTokens(message),
        0,
    );
    let start = 0;

    while (start < middle.length && running > budget) {
        running -= messageTokens(middle[start]);
        start += 1;
    }

    while (start < middle.length && middle[start].role === 'tool') {
        running -= messageTokens(middle[start]);
        start += 1;
    }

    const kept = [...lead, ...middle.slice(start), ...tail];

    return running > budget ? squeeze(kept, budget) : kept;
}

export function buildSystemPrompt(documents: AgentDocumentLike[], lazy = false): string {
    const sorted = [...documents].sort((a, b) => {
        if (a.name === 'instructions.md') {
            return -1;
        }

        if (b.name === 'instructions.md') {
            return 1;
        }

        return a.name.localeCompare(b.name);
    });

    const inline = (document: AgentDocumentLike) =>
        !lazy ||
        ALWAYS_INLINE.includes(document.name) ||
        document.content.trim().length <= DOCUMENT_INLINE_MAX;

    const sections = sorted
        .filter(inline)
        .map((document) => document.content.trim())
        .filter((content) => content !== '');

    const deferred = sorted.filter((document) => !inline(document));

    if (deferred.length > 0) {
        sections.push(
            [
                '# Your reference files',
                '',
                'The files below are not included here. Call `document_read` with the file name to read one when a question needs it. Do not guess at what they contain.',
                '',
                ...deferred.map(
                    (document) =>
                        `- ${document.name} (${document.content.trim().length} characters)`,
                ),
            ].join('\n'),
        );
    }

    return sections.join('\n\n---\n\n');
}

export function earlierTurns<T extends { id: number }>(newestFirst: T[], messageId: number): T[] {
    return [...newestFirst].reverse().filter((message) => message.id !== messageId);
}

export function buildMessages(
    systemPrompt: string,
    history: HistoryMessage[],
    incoming: string,
    parts: ContentPart[] = [],
): ChatMessage[] {
    const messages: ChatMessage[] = [];

    if (systemPrompt !== '') {
        messages.push({ role: 'system', content: systemPrompt });
    }

    for (const message of history.slice(-HISTORY_LIMIT)) {
        messages.push({
            role: message.direction === 'out' ? 'assistant' : 'user',
            content: message.text,
        });
    }

    messages.push({ role: 'user', content: incoming, ...(parts.length > 0 && { parts }) });

    return messages;
}

export function readCompletion(payload: unknown): string | undefined {
    if (typeof payload !== 'object' || payload === null) {
        return undefined;
    }

    const choices = (payload as { choices?: unknown }).choices;

    if (!Array.isArray(choices) || choices.length === 0) {
        return undefined;
    }

    const message = (choices[0] as { message?: unknown }).message;

    if (typeof message !== 'object' || message === null) {
        return undefined;
    }

    const content = (message as { content?: unknown }).content;

    if (typeof content !== 'string' || content.trim() === '') {
        return undefined;
    }

    return content.trim().slice(0, TELEGRAM_TEXT_MAX);
}

export function isToolRefusal(payload: unknown): boolean {
    const message = readError(payload).toLowerCase();

    if (message === '') {
        return false;
    }

    return (
        /tool[ _-]?(use|call|compatib)/.test(message) ||
        (message.includes('tool') &&
            (message.includes('support') || message.includes('not available')))
    );
}

export function readError(payload: unknown): string {
    if (typeof payload !== 'object' || payload === null) {
        return '';
    }

    const error = (payload as { error?: unknown }).error;

    if (typeof error === 'string') {
        return error.trim().slice(0, ERROR_TEXT_MAX);
    }

    if (typeof error !== 'object' || error === null) {
        return '';
    }

    const message = (error as { message?: unknown }).message;

    return typeof message === 'string' ? message.trim().slice(0, ERROR_TEXT_MAX) : '';
}

export function readToolCalls(payload: unknown): ToolCall[] {
    if (typeof payload !== 'object' || payload === null) {
        return [];
    }

    const choices = (payload as { choices?: unknown }).choices;

    if (!Array.isArray(choices) || choices.length === 0) {
        return [];
    }

    const message = (choices[0] as { message?: unknown }).message;

    if (typeof message !== 'object' || message === null) {
        return [];
    }

    const calls = (message as { tool_calls?: unknown }).tool_calls;

    if (!Array.isArray(calls)) {
        return [];
    }

    const out: ToolCall[] = [];

    for (const raw of calls) {
        if (typeof raw !== 'object' || raw === null) {
            continue;
        }

        const id = (raw as { id?: unknown }).id;
        const fn = (raw as { function?: unknown }).function;

        if (typeof id !== 'string' || typeof fn !== 'object' || fn === null) {
            continue;
        }

        const name = (fn as { name?: unknown }).name;
        const rawArgs = (fn as { arguments?: unknown }).arguments;

        if (typeof name !== 'string') {
            continue;
        }

        let args: Record<string, unknown> = {};

        if (typeof rawArgs === 'string' && rawArgs.trim() !== '') {
            try {
                const parsed: unknown = JSON.parse(rawArgs);

                if (typeof parsed === 'object' && parsed !== null) {
                    args = parsed as Record<string, unknown>;
                }
            } catch {
                continue;
            }
        } else if (typeof rawArgs === 'object' && rawArgs !== null) {
            args = rawArgs as Record<string, unknown>;
        }

        out.push({ id, name, arguments: args });
    }

    return out;
}

export function readAssistantTurn(payload: unknown): unknown {
    if (typeof payload !== 'object' || payload === null) {
        return undefined;
    }

    const choices = (payload as { choices?: unknown }).choices;

    return Array.isArray(choices) && choices.length > 0
        ? (choices[0] as { message?: unknown }).message
        : undefined;
}

export function readUsage(payload: unknown): { prompt: number; completion: number } {
    const usage =
        typeof payload === 'object' && payload !== null
            ? (payload as { usage?: unknown }).usage
            : undefined;

    if (typeof usage !== 'object' || usage === null) {
        return { prompt: 0, completion: 0 };
    }

    const count = (value: unknown) =>
        typeof value === 'number' && Number.isFinite(value) && value > 0
            ? Math.min(Math.round(value), 2_000_000_000)
            : 0;

    const reported = usage as Record<string, unknown>;

    return {
        prompt: count(
            reported['prompt_tokens'] ?? reported['promptTokens'] ?? reported['input_tokens'],
        ),
        completion: count(
            reported['completion_tokens'] ??
                reported['completionTokens'] ??
                reported['output_tokens'],
        ),
    };
}

export function countTokens(
    payload: unknown,
    sent: { messages: ChatMessage[]; tools?: unknown[] },
    ok: boolean,
): { prompt: number; completion: number; estimated: boolean } {
    const reported = readUsage(payload);

    if (reported.prompt + reported.completion > 0 || !ok) {
        return { ...reported, estimated: false };
    }

    const turn = readAssistantTurn(payload) as
        | { content?: unknown; tool_calls?: unknown; toolCalls?: unknown }
        | undefined;
    const calls = turn?.tool_calls ?? turn?.toolCalls;

    return {
        prompt:
            sent.messages.reduce((sum, message) => sum + messageTokens(message), 0) +
            (sent.tools === undefined ? 0 : estimateTokens(JSON.stringify(sent.tools))),
        completion:
            (typeof turn?.content === 'string' ? estimateTokens(turn.content) : 0) +
            (calls === undefined ? 0 : estimateTokens(JSON.stringify(calls))),
        estimated: true,
    };
}

export function toolGuidance(tools: readonly string[]): string {
    const web = ['web_search', 'weather', 'web_fetch'].filter((name) => tools.includes(name));
    const apps = tools.filter((name) => PLUGIN_TOOLS.some((tool) => tool.name === name));
    const sections: string[] = [];

    if (web.length > 0) {
        sections.push(
            [
                '# Looking things up',
                '',
                `You can use ${web.join(', ')}. For anything current or that you do not know for certain, such as news, weather, prices or facts about the world, call these tools before you answer. Never say you cannot look something up while you have them: search first, then read a page if the snippets are not enough.`,
            ].join('\n'),
        );
    }

    if (apps.length > 0) {
        sections.push(
            [
                '# Connected apps',
                '',
                `You can act on connected apps with ${apps.join(', ')}. When you are asked to post, reply, send, publish or read something there, call the tool to do it, then say in a sentence what you did. Do not only write the post out in your answer.`,
            ].join('\n'),
        );
    }

    return sections.join('\n\n');
}
