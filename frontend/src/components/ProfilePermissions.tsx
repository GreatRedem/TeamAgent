import { useCallback, useEffect, useState } from 'react';

import { ApiError, permissionCatalog, profilePermissionUpdate, type Permission, type TelegramProfile } from '../api';
import { Panel } from './ui/Panel';

import {
    CLASS_GHOST,
    CLASS_GHOST_DANGER,
    CLASS_NOTE,
    CLASS_NOTE_ERROR,
    CLASS_ROW,
    CLASS_ROWS,
    CLASS_ROW_META,
    CLASS_ROW_NAME,
    CLASS_ROW_TEXT
} from '../lib/constant';

interface ProfilePermissionsProps
{
    teamId: number;
    profile: TelegramProfile;
    onChange: (profile: TelegramProfile) => void;
}

export function ProfilePermissions({ teamId, profile, onChange }: ProfilePermissionsProps)
{
    const [ catalog, setCatalog ] = useState<Permission[] | null>(null);
    const [ saving, setSaving ] = useState<string | null>(null);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() =>
    {
        let active = true;

        permissionCatalog(teamId)
            .then((payload) =>
            {
                if (active)
                {
                    setCatalog(payload.permissions);
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setCatalog([ ]);
                    setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
                }
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId ]);

    const toggle = useCallback(async(key: string) =>
    {
        const granted = profile.permissions.includes(key);

        const next = granted
            ? profile.permissions.filter((item) => item !== key)
            : [ ...profile.permissions, key ];

        setError(null);
        setSaving(key);

        try
        {
            onChange(await profilePermissionUpdate(teamId, profile.id, next));
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setSaving(null);
        }
    }, [ teamId, profile, onChange ]);

    return (
        <Panel title="Permissions" sub="What this person may do. Anything not granted is denied">
            { error !== null && <p className={ CLASS_NOTE_ERROR } role="alert">{ error }</p> }

            { catalog === null && <p className={ CLASS_NOTE }>Loading permissions...</p> }

            { catalog !== null && catalog.length > 0 && (
                <ul className={ CLASS_ROWS }>
                    { catalog.map((permission) =>
                    {
                        const granted = profile.permissions.includes(permission.key);

                        return (
                            <li className={ CLASS_ROW } key={ permission.key }>
                                <span className={ CLASS_ROW_TEXT }>
                                    <span className={ CLASS_ROW_NAME }>{ permission.label }</span>
                                    <span className={ CLASS_ROW_META }>{ permission.description }</span>
                                </span>

                                <button
                                    className={ granted ? CLASS_GHOST : CLASS_GHOST_DANGER }
                                    type="button"
                                    disabled={ saving === permission.key }
                                    aria-pressed={ granted }
                                    onClick={ () => void toggle(permission.key) }
                                >
                                    { saving === permission.key ? 'Saving...' : granted ? 'Allowed' : 'Denied' }
                                </button>
                            </li>
                        );
                    }) }
                </ul>
            ) }
        </Panel>
    );
}
