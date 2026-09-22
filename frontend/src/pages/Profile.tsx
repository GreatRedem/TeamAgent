import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import { ButtonLink } from '../components/Button';
import { PaginationFooter } from '../components/PaginationFooter';
import { Panel, PageHead } from '../components/Panel';
import { ProfilePermissions } from '../components/ProfilePermissions';
import { profileName } from '../components/profileName';
import { ApiError, profileDetails, profileFiles, type Paged, type ProfileFile, type TelegramMessage, type TelegramProfile, type TelegramProfileBot } from '../lib/api';
import { clearAccessToken, readAccessToken } from '../lib/session';
import { tokenLabel } from '../lib/tokens';

interface Details
{
    profile: TelegramProfile;
    bots: TelegramProfileBot[];
    messages: TelegramMessage[];
}

/** A row in the identity table, skipped entirely when Telegram gave us nothing. */
function Field({ label, value }: { label: string; value: string })
{
    if (value === '')
    {
        return null;
    }

    return (
        <div className="details__row">
            <dt className="details__key">{ label }</dt>
            <dd className="details__value">{ value }</dd>
        </div>
    );
}

/**
 * Everything held about one person who has messaged the team's bots: the fields
 * Telegram supplies, which bots they have written to, and their full history.
 */
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

    // Message rows carry a bot id; the header knows the names.
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

            { details === null && shown === null && <p className="note">Loading profile...</p> }

            { shown !== null && <p className="note" data-state="error" role="alert">{ shown }</p> }

            { details !== null && (
                <>
                    <Panel title="Identity" sub="What Telegram tells us about this person">
                        <dl className="details mt-0">
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
                        { details.bots.length === 0 && <p className="note">No stored messages to attribute.</p> }

                        { details.bots.length > 0 && (
                            <ul className="rows mt-0">
                                { details.bots.map((bot) => (
                                    <li className="rows__item rows__item--row" key={ bot.id }>
                                        <span className="rows__text">
                                            <span className="rows__name">{ bot.name }</span>
                                            <span className="rows__meta">last { new Date(bot.last_seen_at).toLocaleString() }</span>
                                        </span>

                                        <span className="rows__meta">{ bot.message_count } message{ bot.message_count === 1 ? '' : 's' }</span>
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
                        <p className="note mt-0">
                            Written by agents through the internal tools. Read-only here — editing them by
                            hand would change what an agent believes without the agent seeing it happen.
                        </p>

                        { files.length === 0 && <p className="note">No files yet.</p> }

                        { files.map((file) => (
                            <article className="doc" key={ file.id }>
                                <header className="doc__head">
                                    <span className="doc__name">{ file.name }</span>

                                    { /* Read through a tool when an agent asks for it, so this is
                                         a cost per lookup rather than one paid on every message. */ }
                                    <span className="doc__cost" title="Estimated tokens, charged when an agent reads this file">
                                        { tokenLabel(file.content) }
                                    </span>

                                    <span className="rows__meta">{ new Date(file.updated_at).toLocaleString() }</span>
                                </header>

                                <pre className="doc__editor doc__editor--read">{ file.content }</pre>
                            </article>
                        )) }
                    </Panel>

                    <Panel title="Conversations" sub="Everything they have written, oldest first">
                        { details.messages.length === 0 && <p className="note">No messages stored yet.</p> }

                        { details.messages.length > 0 && (
                            <div className="thread__body thread__body--plain mt-0">
                                { details.messages.map((message) => (
                                    <p className="bubble" data-direction={ message.direction } key={ message.id }>
                                        <span className="bubble__text">{ message.text }</span>

                                        <time className="bubble__time" dateTime={ message.sent_at }>
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
