import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import {
    FILE_MAX_BYTES,
    FILE_TEXT_MAX,
    FILE_TIMEOUT,
    TELEGRAM_API,
    TEXT_FILE_PATTERN,
} from '../../constant.js';

import type { ContentPart } from '../agent/agent.reply.js';
import { settingsOf } from '../plugin/plugin.common.js';
import { TeamPlugin } from '../plugin/plugin.entity.js';
import { recordCall } from '../plugin/plugin.tools.js';
import { transcribe } from '../plugin/plugin.voice.js';
import { telegramMethod } from './telegram.client.js';

export interface InboundFile {
    kind: 'voice' | 'photo' | 'document';
    id: string;
    name: string;
    mime: string;
    size: number;
}

export interface ReadFile {
    text: string;
    saved: string;
    parts: ContentPart[];
}

function field(message: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
    const value = message[key];

    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function word(value: unknown, fallback: string): string {
    return typeof value === 'string' && value !== '' ? value : fallback;
}

function bytesOf(value: unknown): number {
    return typeof value === 'number' ? value : 0;
}

export function inboundFile(message: Record<string, unknown>): InboundFile | undefined {
    const voice = field(message, 'voice') ?? field(message, 'audio');

    if (typeof voice?.['file_id'] === 'string') {
        return {
            kind: 'voice',
            id: voice['file_id'],
            name: word(voice['file_name'], 'voice.ogg'),
            mime: word(voice['mime_type'], 'audio/ogg'),
            size: bytesOf(voice['file_size']),
        };
    }

    const photos = message['photo'];
    const largest = Array.isArray(photos)
        ? (photos.at(-1) as Record<string, unknown> | undefined)
        : undefined;

    if (typeof largest?.['file_id'] === 'string') {
        return {
            kind: 'photo',
            id: largest['file_id'],
            name: 'photo.jpg',
            mime: 'image/jpeg',
            size: bytesOf(largest['file_size']),
        };
    }

    const document = field(message, 'document');

    if (typeof document?.['file_id'] === 'string') {
        return {
            kind: 'document',
            id: document['file_id'],
            name: word(document['file_name'], 'file'),
            mime: word(document['mime_type'], 'application/octet-stream'),
            size: bytesOf(document['file_size']),
        };
    }

    return undefined;
}

export function fileKind(file: InboundFile): 'audio' | 'image' | 'pdf' | 'text' | 'other' {
    if (file.kind === 'voice' || file.mime.startsWith('audio/')) {
        return 'audio';
    }

    if (file.kind === 'photo' || file.mime.startsWith('image/')) {
        return 'image';
    }

    if (file.mime === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        return 'pdf';
    }

    return TEXT_FILE_PATTERN.test(file.mime) || TEXT_FILE_PATTERN.test(file.name)
        ? 'text'
        : 'other';
}

async function download(
    token: string,
    file: InboundFile,
): Promise<{ bytes: Uint8Array<ArrayBuffer> } | { error: string }> {
    if (file.size > FILE_MAX_BYTES) {
        return { error: 'it is larger than 20 MB' };
    }

    const found = await telegramMethod(token, 'getFile', { file_id: file.id });
    const path = (found.data as { file_path?: string } | undefined)?.file_path;

    if (!found.ok || path === undefined) {
        return { error: found.error ?? 'Telegram did not hand it over' };
    }

    try {
        const response = await fetch(`${TELEGRAM_API}/file/bot${token}/${path}`, {
            signal: AbortSignal.timeout(FILE_TIMEOUT),
        });

        if (!response.ok) {
            return { error: `Telegram answered ${response.status}` };
        }

        const bytes = new Uint8Array(await response.arrayBuffer());

        return bytes.length > FILE_MAX_BYTES ? { error: 'it is larger than 20 MB' } : { bytes };
    } catch {
        return { error: 'it could not be downloaded' };
    }
}

export async function readAttachment(
    fastify: FastifyInstance,
    log: FastifyBaseLogger,
    teamId: number,
    token: string,
    file: InboundFile,
): Promise<ReadFile> {
    const kind = fileKind(file);
    const unreadable = (why: string): ReadFile => ({
        text: `[They sent ${file.name}, but it could not be read: ${why}. Tell them.]`,
        saved: `[file ${file.name}]`,
        parts: [],
    });

    if (kind === 'other') {
        return {
            text: `[They sent the file ${file.name} (${file.mime}), which you cannot open. You can read photos, PDFs, text files and, with Speech to text, voice messages.]`,
            saved: `[file ${file.name}]`,
            parts: [],
        };
    }

    const [plugin] =
        kind === 'audio'
            ? await fastify.db.getRepository(TeamPlugin).find({
                  where: { team_id: teamId, kind: 'voice', enabled: true },
                  order: { id: 'ASC' },
                  take: 1,
              })
            : [];

    if (kind === 'audio' && plugin === undefined) {
        return {
            text: '[They sent a voice message, but this project has no Speech to text plugin, so you cannot hear it. Tell them.]',
            saved: '[voice message]',
            parts: [],
        };
    }

    const got = await download(token, file);

    if ('error' in got) {
        return unreadable(got.error);
    }

    if (plugin !== undefined) {
        const startedAt = Date.now();
        const heard = await transcribe(settingsOf(plugin), { ...file, bytes: got.bytes });

        await recordCall(fastify, log, plugin, {
            direction: 'tool',
            action: 'transcribe',
            outcome: heard,
            durationMs: Date.now() - startedAt,
            request: `${file.name} · ${got.bytes.length} bytes`,
            ...(heard.ok && { response: String(heard.data) }),
        });

        if (!heard.ok) {
            return unreadable(`transcription failed (${heard.error ?? 'unknown'})`);
        }

        const said = String(heard.data);

        return said === ''
            ? {
                  text: '[They sent a voice message with no words in it.]',
                  saved: '[voice message]',
                  parts: [],
              }
            : { text: said, saved: `[voice] ${said}`, parts: [] };
    }

    const base64 = Buffer.from(got.bytes).toString('base64');

    if (kind === 'image') {
        return {
            text: '',
            saved: '[photo]',
            parts: [{ kind: 'image', name: file.name, data: `data:${file.mime};base64,${base64}` }],
        };
    }

    if (kind === 'pdf') {
        return {
            text: `[They sent the PDF ${file.name}.]`,
            saved: `[file ${file.name}]`,
            parts: [
                { kind: 'file', name: file.name, data: `data:application/pdf;base64,${base64}` },
            ],
        };
    }

    const shown = `[File ${file.name}]\n${new TextDecoder().decode(got.bytes).slice(0, FILE_TEXT_MAX)}`;

    return { text: shown, saved: shown, parts: [] };
}
