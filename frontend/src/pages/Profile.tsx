import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import { ButtonLink } from '../components/ui/Button';
import { PaginationFooter } from '../components/ui/PaginationFooter';
import { Panel, PageHead } from '../components/ui/Panel';
import { ProfilePermissions } from '../components/ProfilePermissions';
import { profileName } from '../lib/profileName';
import { ApiError, profileDetails, profileFiles, type Paged, type ProfileFile, type TelegramMessage, type TelegramProfile, type TelegramProfileBot } from '../api';
import { clearAccessToken, readAccessToken } from '../lib/session';
import { tokenLabel } from '../lib/tokens';

import {
    CLASS_BUBBLE_IN,
    CLASS_BUBBLE_OUT,
    CLASS_BUBBLE_TEXT,
    CLASS_BUBBLE_TIME,
    CLASS_DETAILS,
    CLASS_DETAILS_KEY,
    CLASS_DETAILS_ROW,
    CLASS_DETAILS_VALUE,
    CLASS_DOC,
    CLASS_DOC_COST,
    CLASS_DOC_HEAD,
    CLASS_DOC_NAME,
    CLASS_DOC_READER,
    CLASS_NOTE,
    CLASS_NOTE_ERROR,
    CLASS_ROW,
    CLASS_ROWS,
    CLASS_ROW_META,
    CLASS_ROW_NAME,
    CLASS_ROW_TEXT
} from '../lib/constant';

interface Details
{
    profile: TelegramProfile;
    bots: TelegramProfileBot[];
    messages: TelegramMessage[];
}

function Field({ label, value }: { label: string; value: string })
{
    if (value === '')
    {
        return null;
    }

    return (
        <div className={ CLASS_DETAILS_ROW }>
            <dt className={ CLASS_DETAILS_KEY }>{ label }</dt>
            <dd className={ CLASS_DETAILS_VALUE }>{ value }</dd>
        </div>
    );
}

export function Profile()
{
    const navigate = useNavigate();

    const { id, profileId } = useParams<{ id: string; profileId: string }>();

    const teamId = Number(id);
    const personId = Number(profileId);

    const idsInvalid = !Number.isInteger(teamId) || teamId < 1 || !Number.isInteger(personId) || personId < 1;

    const [ details, setDetails ] = useState<Details | null>(null);
    const [ files, setFiles ] = useState<ProfileFile[]>([ ]);
    const [ filePage, setFilePage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() =>
    {
        if (readAccessToken() === null)
        {
            void navigate('/', { replace: true });

            return;
        }

        if (idsInvalid)
        {
            return;
        }

        let active = true;

        Promise.all([ profileDetails(teamId, personId), profileFiles(teamId, personId) ])
            .then(([ payload, filePayload ]) =>
            {
                if (active)
                {
                    setDetails(payload);
                    setFiles(filePayload.files);
                    setFilePage(filePayload);
                }
            })
            .catch((cause: unknown) =>
            {
                if (!active)
                {
                    return;
                }

                if (cause instanceof ApiError && cause.status === 401)
                {
                    clearAccessToken();

                    void navigate('/', { replace: true });

                    return;
                }

                setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId, personId, idsInvalid, navigate ]);

    const goToFiles = useCallback(async(offset: number) =>
    {
        setPaging(true);

        try
        {
            const next = await profileFiles(teamId, personId, { offset });

            setFiles(next.files);
            setFilePage(next);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setPaging(false);
        }
    }, [ teamId, personId ]);

    const shown = idsInvalid ? 'PROFILE_ID_INVALID' : error;

    const botNames = new Map((details?.bots ?? [ ]).map((bot) => [ bot.id, bot.name ]));

    return (
        <>
            <PageHead
                title={ details !== null ? profileName(details.profile) : 'Profile' }
                sub={ details !== null && details.profile.username !== '' ? `@${ details.profile.username }` : undefined }
                actions={ (
                    <ButtonLink to={ `/dashboard/team/${ teamId }/bots` } icon={ <ArrowLeft size={ 18 } aria-hidden="true" /> }>
                        Back
                    </ButtonLink>
                ) }
            />

            { details === null && shown === null && <p className={ CLASS_NOTE }>Loading profile...</p> }

            { shown !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ shown }</p> }

            { details !== null && (
                <>
                    <Panel title="Identity" sub="What Telegram tells us about this person">
                        <dl className={ CLASS_DETAILS }>
                            <Field label="Telegram ID" value={ details.profile.telegram_id } />
                            <Field label="Username" value={ details.profile.username !== '' ? `@${ details.profile.username }` : '' } />
                            <Field label="First name" value={ details.profile.first_name } />
                            <Field label="Last name" value={ details.profile.last_name } />
                            <Field label="Language" value={ details.profile.language_code } />
                            <Field label="Messages" value={ String(details.profile.message_count) } />
                            <Field label="First seen" value={ new Date(details.profile.created_at).toLocaleString() } />
                            <Field label="Last seen" value={ new Date(details.profile.last_seen_at).toLocaleString() } />
                        </dl>
                    </Panel>

                    <ProfilePermissions
                        teamId={ teamId }
                        profile={ details.profile }
                        onChange={ (updated) => setDetails({ ...details, profile: updated }) }
                    />

                    <Panel title="Bots" sub="Which of the team’s bots they have written to">
                        { details.bots.length === 0 && <p className={ CLASS_NOTE }>No stored messages to attribute.</p> }

                        { details.bots.length > 0 && (
                            <ul className={ CLASS_ROWS }>
                                { details.bots.map((bot) => (
                                    <li className={ CLASS_ROW } key={ bot.id }>
                                        <span className={ CLASS_ROW_TEXT }>
                                            <span className={ CLASS_ROW_NAME }>{ bot.name }</span>
                                            <span className={ CLASS_ROW_META }>last { new Date(bot.last_seen_at).toLocaleString() }</span>
                                        </span>

                                        <span className={ CLASS_ROW_META }>{ bot.message_count } message{ bot.message_count === 1 ? '' : 's' }</span>
                                    </li>
                                )) }
                            </ul>
                        ) }
                    </Panel>

                    <Panel
                        title="Files"
                        sub="Notes agents keep about them"
                        footer={ filePage !== null && (
                            <PaginationFooter page={ filePage } shown={ files.length } busy={ paging } noun="files" onPage={ (offset) => void goToFiles(offset) } />
                        ) }
                    >
                        <p className={ CLASS_NOTE }>
                            Written by agents through the internal tools. Read-only here — editing them by
                            hand would change what an agent believes without the agent seeing it happen.
                        </p>

                        { files.length === 0 && <p className={ CLASS_NOTE }>No files yet.</p> }

                        { files.map((file) => (
                            <article className={ CLASS_DOC } key={ file.id }>
                                <header className={ CLASS_DOC_HEAD }>
                                    <span className={ CLASS_DOC_NAME }>{ file.name }</span>


                                    <span className={ CLASS_DOC_COST } title="Estimated tokens, charged when an agent reads this file">
                                        { tokenLabel(file.content) }
                                    </span>

                                    <span className={ CLASS_ROW_META }>{ new Date(file.updated_at).toLocaleString() }</span>
                                </header>

                                <pre className={ CLASS_DOC_READER }>{ file.content }</pre>
                            </article>
                        )) }
                    </Panel>

                    <Panel title="Conversations" sub="Everything they have written, oldest first">
                        { details.messages.length === 0 && <p className={ CLASS_NOTE }>No messages stored yet.</p> }

                        { details.messages.length > 0 && (
                            <div className="grid gap-2">
                                { details.messages.map((message) => (
                                    <p className={ message.direction === 'out' ? CLASS_BUBBLE_OUT : CLASS_BUBBLE_IN } key={ message.id }>
                                        <span className={ CLASS_BUBBLE_TEXT }>{ message.text }</span>

                                        <time className={ CLASS_BUBBLE_TIME } dateTime={ message.sent_at }>
                                            { message.direction === 'out' ? 'agent · ' : '' }
                                            { botNames.get(message.bot_id) ?? 'Removed bot' } · { new Date(message.sent_at).toLocaleString() }
                                        </time>
                                    </p>
                                )) }
                            </div>
                        ) }
                    </Panel>
                </>
            ) }
        </>
    );
}
