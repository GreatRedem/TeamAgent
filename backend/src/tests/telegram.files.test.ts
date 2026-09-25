import assert from 'node:assert/strict';

import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { buildMessages, recordable } from '../routes/agent/agent.reply.js';
import { wireMessages } from '../routes/agent/agent.transport.js';
import { TeamPlugin, TeamPluginCall } from '../routes/plugin/plugin.entity.js';
import { fileKind, inboundFile, readAttachment } from '../routes/telegram/telegram.files.js';
import { readInboundMessage } from '../routes/telegram/telegram.service.js';

function update(message: Record<string, unknown>) {
    return {
        update_id: 1,
        message: {
            message_id: 10,
            date: 1_790_000_000,
            from: { id: 5, first_name: 'Sara' },
            chat: { id: 5, type: 'private' },
            ...message,
        },
    };
}

async function main() {
    const voice = inboundFile({ voice: { file_id: 'V1', mime_type: 'audio/ogg', file_size: 900 } });

    assert.deepEqual(voice, {
        kind: 'voice',
        id: 'V1',
        name: 'voice.ogg',
        mime: 'audio/ogg',
        size: 900,
    });
    assert.equal(
        inboundFile({ photo: [{ file_id: 'small' }, { file_id: 'large', file_size: 5 }] })?.id,
        'large',
        'the largest photo size is used',
    );
    assert.equal(
        inboundFile({
            document: { file_id: 'D', file_name: 'plan.pdf', mime_type: 'application/pdf' },
        })?.name,
        'plan.pdf',
    );
    assert.equal(inboundFile({ text: 'hi' }), undefined);

    const kinds = [
        { kind: 'voice', name: 'v.ogg', mime: 'audio/ogg' },
        { kind: 'document', name: 'song.mp3', mime: 'audio/mpeg' },
        { kind: 'photo', name: 'photo.jpg', mime: 'image/jpeg' },
        { kind: 'document', name: 'scan.PDF', mime: 'application/octet-stream' },
        { kind: 'document', name: 'notes.md', mime: 'application/octet-stream' },
        { kind: 'document', name: 'data.json', mime: 'application/json' },
        { kind: 'document', name: 'movie.mp4', mime: 'video/mp4' },
    ].map((file) => fileKind({ id: 'x', size: 1, ...file } as never));

    assert.deepEqual(kinds, ['audio', 'audio', 'image', 'pdf', 'text', 'text', 'other']);

    const photo = readInboundMessage(
        update({ photo: [{ file_id: 'P' }], caption: 'What is this?' }),
    );

    assert.equal(photo?.text, 'What is this?', 'the caption is the text');
    assert.equal(photo?.file?.kind, 'photo');
    assert.equal(readInboundMessage(update({ voice: { file_id: 'V' } }))?.file?.kind, 'voice');
    assert.equal(readInboundMessage(update({ sticker: { file_id: 'S' } })), undefined);

    const bot = { id: 77, username: 'nura_bot' };
    const group = { chat: { id: -100, type: 'supergroup', title: 'Team' } };

    assert.equal(
        readInboundMessage(update({ ...group, voice: { file_id: 'V' } }), bot),
        undefined,
        'a voice note in a group is not for the bot unless it replies to it',
    );
    assert.equal(
        readInboundMessage(
            update({ ...group, voice: { file_id: 'V' }, reply_to_message: { from: { id: 77 } } }),
            bot,
        )?.file?.kind,
        'voice',
    );
    assert.equal(
        readInboundMessage(
            update({ ...group, photo: [{ file_id: 'P' }], caption: '@nura_bot read this' }),
            bot,
        )?.text,
        'read this',
    );

    const messages = buildMessages('system', [], 'Look', [
        { kind: 'image', name: 'photo.jpg', data: 'data:image/jpeg;base64,AAAA' },
        { kind: 'file', name: 'plan.pdf', data: 'data:application/pdf;base64,BBBB' },
    ]);

    assert.deepEqual((wireMessages(messages, false)[1] as { content: unknown }).content, [
        { type: 'text', text: 'Look' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
        {
            type: 'file',
            file: { filename: 'plan.pdf', file_data: 'data:application/pdf;base64,BBBB' },
        },
    ]);
    assert.deepEqual((wireMessages(messages, true)[1] as { content: unknown[] }).content[1], {
        type: 'image_url',
        imageUrl: { url: 'data:image/jpeg;base64,AAAA' },
    });
    assert.equal((wireMessages(messages, false)[0] as { content: unknown }).content, 'system');
    assert.ok(
        !JSON.stringify(recordable(messages)).includes('AAAA'),
        'recorded requests never keep the file itself',
    );

    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    let sentForm: FormData | undefined;
    const plugins = [
        {
            id: 3,
            team_id: 1,
            kind: 'voice',
            enabled: true,
            secrets: JSON.stringify({ api_key: 'sk-test' }),
            config: JSON.stringify({
                base_url: 'https://8.8.8.8/v1',
                model: 'whisper-1',
                language: 'fa',
            }),
        },
    ];
    const recorded: Record<string, unknown>[] = [];
    const fastify = {
        db: {
            getRepository: (entity: unknown) =>
                entity === TeamPlugin
                    ? {
                          find: async (options: { where: { team_id: number } }) =>
                              plugins.filter((plugin) => plugin.team_id === options.where.team_id),
                      }
                    : entity === TeamPluginCall
                      ? {
                            save: async (row: Record<string, unknown>) => {
                                recorded.push(row);

                                return row;
                            },
                        }
                      : {},
        },
    } as unknown as FastifyInstance;
    const log = { error() {} } as unknown as FastifyBaseLogger;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);

        calls.push(url.replace(/bot[^/]+/, 'bot<token>'));

        if (url.endsWith('/getFile')) {
            return Response.json({ ok: true, result: { file_path: 'voice/file_1.oga' } });
        }

        if (url.includes('/file/bot')) {
            return new Response(
                new TextEncoder().encode(url.includes('.txt') ? 'line one\nline two' : 'audio'),
            );
        }

        if (url.endsWith('/audio/transcriptions')) {
            sentForm = init?.body as FormData;

            return Response.json({ text: ' Remind me at five. ' });
        }

        return new Response('{}', { status: 404 });
    }) as typeof fetch;

    try {
        const heard = await readAttachment(fastify, log, 1, '123:ABC', voice as never);

        assert.equal(heard.text, 'Remind me at five.');
        assert.equal(
            heard.saved,
            '[voice] Remind me at five.',
            'the transcript stays in the history',
        );
        assert.equal(sentForm?.get('model'), 'whisper-1');
        assert.equal(sentForm?.get('language'), 'fa');
        assert.equal(recorded.at(-1)?.['action'], 'transcribe');
        assert.equal(recorded.at(-1)?.['ok'], true);

        const deaf = await readAttachment(fastify, log, 2, '123:ABC', voice as never);

        assert.match(
            deaf.text,
            /no Speech to text plugin/,
            'without the plugin the agent is told why',
        );

        const image = await readAttachment(fastify, log, 1, '123:ABC', {
            kind: 'photo',
            id: 'P',
            name: 'photo.jpg',
            mime: 'image/jpeg',
            size: 5,
        });

        assert.equal(image.parts[0]?.kind, 'image');
        assert.ok(image.parts[0]?.data.startsWith('data:image/jpeg;base64,'));

        const text = await readAttachment(fastify, log, 1, '123:ABC', {
            kind: 'document',
            id: 'T',
            name: 'notes.txt',
            mime: 'text/plain',
            size: 20,
        });

        assert.equal(text.parts.length, 0);
        assert.match(text.text, /^\[File notes\.txt\]\n/);

        const huge = await readAttachment(fastify, log, 1, '123:ABC', {
            kind: 'document',
            id: 'H',
            name: 'huge.pdf',
            mime: 'application/pdf',
            size: 30 * 1024 * 1024,
        });

        assert.match(huge.text, /larger than 20 MB/);
        assert.ok(
            calls.every((call) => !call.includes('123:ABC')),
            'the bot token never appears outside the Telegram address',
        );
    } finally {
        globalThis.fetch = realFetch;
    }

    console.log('telegram.files: ok');
}

main();
