import { TELEGRAM_API } from '../../constant.js';

import { type CallOutcome, callJson } from '../../utils/http.js';
import { telegramHtml } from './telegram.format.js';

export async function telegramMethod(
    token: string,
    method: string,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
    timeout?: number,
): Promise<CallOutcome> {
    const answer = await callJson(
        `${TELEGRAM_API}/bot${token}/${method}`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            ...(signal && { signal }),
        },
        (body) => (body as { description?: string } | undefined)?.description ?? '',
        timeout,
    );

    return answer.ok ? { ...answer, data: (answer.data as { result?: unknown })?.result } : answer;
}

export function addressedText(
    message: {
        text: string;
        chat?: { type?: string };
        reply_to_message?: { from?: { id?: number } };
    },
    bot: { id: number; username: string },
): string | undefined {
    const handle = new RegExp(`@${bot.username.replace(/[^\w]/g, '')}\\b`, 'gi');
    const named = bot.username !== '';
    const addressed =
        message.chat?.type === 'private' ||
        (named && handle.test(message.text)) ||
        message.reply_to_message?.from?.id === bot.id;
    const text = (named ? message.text.replace(handle, '') : message.text).trim();

    return addressed && text !== '' ? text : undefined;
}

export async function telegramRich(
    token: string,
    method: string,
    payload: Record<string, unknown>,
    field: 'text' | 'caption',
    text: string,
    timeout?: number,
): Promise<CallOutcome> {
    const settled = (sent: CallOutcome) => sent.ok || /not modified/i.test(sent.error ?? '');
    const rich = await telegramMethod(
        token,
        method,
        { ...payload, [field]: telegramHtml(text), parse_mode: 'HTML' },
        undefined,
        timeout,
    );

    if (settled(rich)) {
        return { ...rich, ok: true };
    }

    if (rich.status !== 400) {
        return rich;
    }

    const plain = await telegramMethod(
        token,
        method,
        { ...payload, [field]: text },
        undefined,
        timeout,
    );

    return settled(plain) ? { ...plain, ok: true } : plain;
}
