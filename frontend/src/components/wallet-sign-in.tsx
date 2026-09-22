import { useCallback, useState } from 'react';
import { LoaderCircle, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router';

import { ApiError, walletNonce, walletSignIn } from '@/api';
import { writeAccessToken } from '@/lib/session';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

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
            setStatus({ kind: 'error', message: 'No wallet found in this browser. Install one, then try again.' });

            return;
        }

        try
        {
            setStatus({ kind: 'busy', step: 'Opening your wallet' });

            const accounts = await provider.request({ method: 'eth_requestAccounts' });
            const address = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : undefined;

            if (!address)
            {
                setStatus({ kind: 'error', message: 'Your wallet did not share an account. Unlock it and try again.' });

                return;
            }

            setStatus({ kind: 'busy', step: 'Asking for a challenge' });

            const { message } = await walletNonce(address);

            setStatus({ kind: 'busy', step: 'Waiting for your signature' });

            const signed = await provider.request({ method: 'personal_sign', params: [ message, address ] });

            if (typeof signed !== 'string')
            {
                setStatus({ kind: 'error', message: 'Your wallet returned a signature Nura could not read.' });

                return;
            }

            setStatus({ kind: 'busy', step: 'Checking the signature' });

            const { accessToken } = await walletSignIn(address, signed);

            writeAccessToken(accessToken);

            await navigate('/dashboard', { replace: true });
        }
        catch (error)
        {
            const message = error instanceof ApiError
                ? error.result
                : error instanceof Error ? error.message : 'Sign-in did not finish.';

            setStatus({ kind: 'error', message });
        }
    }, [ navigate ]);

    const busy = status.kind === 'busy';

    return (
        <div className="grid gap-4">
            <Button className="w-full" size="lg" disabled={ busy } onClick={ () => void signIn() }>
                { busy
                    ? <LoaderCircle className="animate-spin" aria-hidden="true" />
                    : <Wallet aria-hidden="true" /> }
                { busy ? status.step : 'Sign in with your wallet' }
            </Button>

            { status.kind === 'error' && (
                <Alert variant="destructive">
                    <AlertDescription>{ status.message }</AlertDescription>
                </Alert>
            ) }
        </div>
    );
}
