import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { CONFIG, IS_DEVELOPMENT, SMS_TIMEOUT } from '../../constant.js';

import { type CallOutcome, callJson, failed } from '../../utils/http.js';

export function plainDigits(input: string): string {
    return input
        .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

export function normalizePhone(input: string): string | null {
    const compact = plainDigits(input).replace(/[\s().-]/g, '');
    const international = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
    const phone = /^09\d{9}$/.test(international) ? `+98${international.slice(1)}` : international;

    return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function codeHash(phone: string, code: string): string {
    return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

export function sameHash(stored: string, given: string): boolean {
    const left = Buffer.from(stored, 'hex');
    const right = Buffer.from(given, 'hex');

    return left.length === right.length && timingSafeEqual(left, right);
}

export async function sendSms(
    log: FastifyBaseLogger,
    phone: string,
    text: string,
): Promise<CallOutcome> {
    if (CONFIG.SMS_API_URL === '') {
        if (IS_DEVELOPMENT) {
            log.info({ module: 'sms', phone, text }, 'sms not configured, printed instead');

            return { ok: true, status: 200 };
        }

        return failed('sms is not configured');
    }

    return callJson(
        CONFIG.SMS_API_URL,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(CONFIG.SMS_API_KEY !== '' && { Authorization: `Bearer ${CONFIG.SMS_API_KEY}` }),
            },
            body: JSON.stringify({ to: phone, text }),
        },
        (body) => JSON.stringify(body ?? '').slice(0, 200),
        SMS_TIMEOUT,
    );
}
