import { Check, LoaderCircle, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { ApiError, walletNonce, walletSignIn } from '@/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { WALLETS } from '@/lib/constant';
import { writeAccessToken } from '@/lib/session';
import { discoverWallets, matchWallet, type DiscoveredWallet } from '@/lib/wallet';

type Status =
    | { kind: 'idle' }
    | { kind: 'busy'; wallet: string; step: string }
    | { kind: 'error'; message: string };

export function WalletSignIn() {
    const navigate = useNavigate();

    const [open, setOpen] = useState(false);
    const [found, setFound] = useState<DiscoveredWallet[] | null>(null);
    const [status, setStatus] = useState<Status>({ kind: 'idle' });

    useEffect(() => {
        if (!open || found !== null) {
            return;
        }

        let active = true;

        void discoverWallets().then((wallets) => {
            if (active) {
                setFound(wallets);
            }
        });

        return () => {
            active = false;
        };
    }, [open, found]);

    const signIn = useCallback(
        async (name: string, provider: EthereumProvider) => {
            try {
                setStatus({ kind: 'busy', wallet: name, step: `Opening ${name}` });

                const accounts = await provider.request({ method: 'eth_requestAccounts' });
                const address =
                    Array.isArray(accounts) && typeof accounts[0] === 'string'
                        ? accounts[0]
                        : undefined;

                if (!address) {
                    setStatus({
                        kind: 'error',
                        message: `${name} did not share an account. Unlock it and try again.`,
                    });

                    return;
                }

                setStatus({ kind: 'busy', wallet: name, step: 'Asking for a challenge' });

                const { message } = await walletNonce(address);

                setStatus({ kind: 'busy', wallet: name, step: 'Waiting for your signature' });

                const signed = await provider.request({
                    method: 'personal_sign',
                    params: [message, address],
                });

                if (typeof signed !== 'string') {
                    setStatus({
                        kind: 'error',
                        message: `${name} returned a signature Nura could not read.`,
                    });

                    return;
                }

                setStatus({ kind: 'busy', wallet: name, step: 'Checking the signature' });

                const { accessToken } = await walletSignIn(address, signed);

                writeAccessToken(accessToken);

                await navigate('/dashboard', { replace: true });
            } catch (error) {
                const message =
                    error instanceof ApiError
                        ? error.result
                        : error instanceof Error
                          ? error.message
                          : 'Sign-in did not finish.';

                setStatus({ kind: 'error', message });
            }
        },
        [navigate],
    );

    const busy = status.kind === 'busy';

    return (
        <>
            <Button
                className="w-full"
                size="lg"
                onClick={() => {
                    setStatus({ kind: 'idle' });
                    setOpen(true);
                }}
            >
                <Wallet aria-hidden="true" />
                Sign in with your wallet
            </Button>

            <Dialog
                open={open}
                onOpenChange={(next) => {
                    if (!busy) {
                        setOpen(next);
                    }
                }}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Choose a wallet</DialogTitle>
                        <DialogDescription>
                            Nura signs you in with a signature. It never moves funds and never costs
                            gas.
                        </DialogDescription>
                    </DialogHeader>

                    <ul className="m-0 grid list-none gap-2 p-0">
                        {WALLETS.map((wallet) => {
                            const installed =
                                found === null
                                    ? undefined
                                    : matchWallet(found, wallet.rdns, wallet.keyword);

                            const fallback =
                                wallet.id === 'metamask' && found?.length === 0
                                    ? window.ethereum
                                    : undefined;

                            const provider = installed?.provider ?? fallback;
                            const running = busy && status.wallet === wallet.name;

                            return (
                                <li key={wallet.id}>
                                    <button
                                        type="button"
                                        disabled={busy || found === null || provider === undefined}
                                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-3 text-start transition-colors hover:border-input hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
                                        onClick={() => {
                                            if (provider !== undefined) {
                                                void signIn(wallet.name, provider);
                                            }
                                        }}
                                    >
                                        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                                            {installed?.icon === undefined ? (
                                                <Wallet
                                                    size={16}
                                                    className="text-muted-foreground"
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <img
                                                    src={installed.icon}
                                                    alt=""
                                                    className="size-9"
                                                />
                                            )}
                                        </span>

                                        <span className="grid min-w-0 gap-0.5">
                                            <span className="truncate font-medium">
                                                {wallet.name}
                                            </span>
                                            <span className="truncate text-2xs text-muted-foreground">
                                                {running
                                                    ? status.step
                                                    : found === null
                                                      ? 'Looking for it'
                                                      : provider === undefined
                                                        ? 'Not installed in this browser'
                                                        : wallet.blurb}
                                            </span>
                                        </span>

                                        <span className="ml-auto shrink-0">
                                            {running ? (
                                                <LoaderCircle
                                                    size={16}
                                                    className="animate-spin text-primary"
                                                    aria-hidden="true"
                                                />
                                            ) : provider === undefined ? null : (
                                                <Check
                                                    size={16}
                                                    className="text-primary"
                                                    aria-hidden="true"
                                                />
                                            )}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    {found?.length === 0 && (
                        <p className="m-0 text-2xs text-muted-foreground">
                            No wallet announced itself. Install one, then reopen this dialog.
                        </p>
                    )}

                    {status.kind === 'error' && (
                        <Alert variant="destructive">
                            <AlertDescription>{status.message}</AlertDescription>
                        </Alert>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
