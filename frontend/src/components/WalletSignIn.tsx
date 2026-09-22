import { useCallback, useState } from 'react';

import { CircleAlert, LoaderCircle, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router';

import { ApiError, walletNonce, walletSignIn } from '../api';
import { CLASS_NOTE_ERROR } from '../lib/constant';
import { writeAccessToken } from '../lib/session';
import { Button } from './ui/Button';

type Status =
    | { kind: 'idle' }
    | { kind: 'busy'; step: string }
    | { kind: 'error'; message: string };

export function WalletSignIn()
{
    const navigate = useNavigate();

    const [ status, setStatus ] = useState<Status>({ kind: 'idle' });

    const signIn = useCallback(async () =>
    {
        const provider = window.ethereum;

        if (!provider)
        {
            setStatus({ kind: 'error', message: 'No wallet detected. Install a browser wallet to continue.' });

            return;
        }

        try
        {
            setStatus({ kind: 'busy', step: 'Connecting wallet' });

            const accounts = await provider.request({ method: 'eth_requestAccounts' });
            const address = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : undefined;

            if (!address)
            {
                setStatus({ kind: 'error', message: 'Wallet returned no account.' });

                return;
            }

            setStatus({ kind: 'busy', step: 'Requesting challenge' });

            const { message } = await walletNonce(address);

            setStatus({ kind: 'busy', step: 'Waiting for signature' });

            const signed = await provider.request({ method: 'personal_sign', params: [ message, address ] });

            if (typeof signed !== 'string')
            {
                setStatus({ kind: 'error', message: 'Wallet returned an unexpected signature.' });

                return;
            }

            setStatus({ kind: 'busy', step: 'Verifying' });

            const { accessToken } = await walletSignIn(address, signed);

            writeAccessToken(accessToken);

            await navigate('/dashboard', { replace: true });
        }
        catch (error)
        {
            const message = error instanceof ApiError
                ? error.result
                : error instanceof Error ? error.message : 'Sign-in failed.';

            setStatus({ kind: 'error', message });
        }
    }, [ navigate ]);

    const busy = status.kind === 'busy';

    return (
        <>
            <Button
                className="w-full justify-center"
                type="button"
                onClick={ () => void signIn() }
                disabled={ busy }
                icon={ busy
                    ? <LoaderCircle className="animate-spin" size={ 18 } aria-hidden="true" />
                    : <Wallet size={ 18 } aria-hidden="true" /> }
            >
                { busy ? status.step : 'Sign in with Wallet' }
            </Button>

            <output className={ `mt-3.5 justify-center ${ CLASS_NOTE_ERROR }` }>
                { status.kind === 'error' && <><CircleAlert size={ 16 } aria-hidden="true" />{ status.message }</> }
            </output>
        </>
    );
}
