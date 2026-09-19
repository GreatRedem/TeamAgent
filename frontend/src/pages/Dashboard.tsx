import { useCallback, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';

import { clearAccessToken, readAccessToken } from '../lib/session';

export function Dashboard()
{
    const navigate = useNavigate();

    const [ token, setToken ] = useState<string | null>(() => readAccessToken());

    // Nothing here is a security boundary -- the backend rejects an absent or
    // invalid token on its own. This only keeps signed-out users off the view.
    useEffect(() =>
    {
        if (token === null)
        {
            void navigate('/', { replace: true });
        }
    }, [ token, navigate ]);

    const signOut = useCallback(() =>
    {
        clearAccessToken();

        setToken(null);
    }, []);

    if (token === null)
    {
        return null;
    }

    return (
        <>
            <p className="subtitle">
                You are signed in. The access token is held for this tab only.
            </p>

            <button className="button" type="button" onClick={ signOut }>
                <LogOut size={ 18 } aria-hidden="true" />
                Sign out
            </button>
        </>
    );
}
