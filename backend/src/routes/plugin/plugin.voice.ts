import { TRANSCRIBE_TIMEOUT } from '../../constant.js';

import { checkPublicUrl } from '../mcp/mcp.web.js';
import { failed, type PluginOutcome, type PluginSettings } from './plugin.common.js';

function endpoint(settings: PluginSettings, path: string): string {
    return `${(settings.config['base_url'] ?? '').replace(/\/+$/, '')}${path}`;
}

function authorization(settings: PluginSettings): Record<string, string> {
    return { authorization: `Bearer ${settings.secrets['api_key'] ?? ''}` };
}

export async function transcribe(
    settings: PluginSettings,
    audio: { bytes: Uint8Array<ArrayBuffer>; name: string; mime: string },
): Promise<PluginOutcome> {
    const check = await checkPublicUrl(endpoint(settings, '/audio/transcriptions'));

    if (!check.ok || !check.url) {
        return failed(check.reason ?? 'refused');
    }

    const form = new FormData();

    form.append('file', new Blob([audio.bytes], { type: audio.mime }), audio.name);
    form.append('model', settings.config['model'] ?? '');

    if ((settings.config['language'] ?? '') !== '') {
        form.append('language', settings.config['language'] ?? '');
    }

    try {
        const response = await fetch(check.url.toString(), {
            method: 'POST',
            redirect: 'manual',
            headers: authorization(settings),
            body: form,
            signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT),
        });
        const body = (await response.json().catch(() => undefined)) as
            | { text?: unknown; error?: { message?: string } }
            | undefined;

        return response.ok && typeof body?.text === 'string'
            ? { ok: true, status: response.status, data: body.text.trim() }
            : failed(
                  body?.error?.message ?? `the service answered ${response.status}`,
                  response.status,
              );
    } catch (cause) {
        return failed(
            cause instanceof Error && cause.name === 'TimeoutError'
                ? 'the service took too long'
                : 'the service could not be reached',
        );
    }
}

export async function voiceProbe(settings: PluginSettings): Promise<PluginOutcome> {
    const check = await checkPublicUrl(endpoint(settings, '/models'));

    if (!check.ok || !check.url) {
        return failed(check.reason ?? 'refused');
    }

    try {
        const response = await fetch(check.url.toString(), {
            redirect: 'manual',
            headers: authorization(settings),
            signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT),
        });

        return response.ok
            ? {
                  ok: true,
                  status: response.status,
                  data: `${settings.config['model'] ?? ''} · ${check.url.host}`,
              }
            : failed(`the service answered ${response.status}`, response.status);
    } catch {
        return failed('the service could not be reached');
    }
}
