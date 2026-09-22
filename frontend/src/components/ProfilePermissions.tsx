import { useCallback, useEffect, useState } from 'react';

import { ApiError, permissionCatalog, profilePermissionUpdate, type Permission, type TelegramProfile } from '../lib/api';
import { Panel } from './Panel';

interface ProfilePermissionsProps
{
    teamId: number;
    profile: TelegramProfile;
    onChange: (profile: TelegramProfile) => void;
}

/**
 * What one person is allowed to do.
 *
 * The catalog comes from the backend rather than being listed here, so adding
 * a permission is a backend-only change and the two can never disagree about
 * which keys exist.
 *
 * Each toggle sends the whole resulting set, matching the endpoint: the UI
 * always knows the complete intended state, so there is no grant/revoke pair
 * to interleave.
 */
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
            { error !== null && <p className="note" data-state="error" role="alert">{ error }</p> }

            { catalog === null && <p className="note">Loading permissions...</p> }

            { catalog !== null && catalog.length > 0 && (
                <ul className="rows mt-0">
                    { catalog.map((permission) =>
                    {
                        const granted = profile.permissions.includes(permission.key);

                        return (
                            <li className="rows__item rows__item--row" key={ permission.key }>
                                <span className="rows__text">
                                    <span className="rows__name">{ permission.label }</span>
                                    <span className="rows__meta">{ permission.description }</span>
                                </span>

                                <button
                                    className={ granted ? 'ghost' : 'ghost ghost--danger' }
                                    type="button"
                                    disabled={ saving === permission.key }
                                    // The button reports the current state and
                                    // toggles it, so it needs the pressed state
                                    // rather than a label that reads as a verb.
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
